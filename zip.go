package main

import (
	"archive/zip"
	"bufio"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

const MaxPartSize = 100 * 1024 * 1024 * 1024 // 100GB (pratik olarak sınırsız)

type ProgressEvent struct {
	Type       string `json:"type"`
	Current    int    `json:"current,omitempty"`
	Total      int    `json:"total,omitempty"`
	Filename   string `json:"filename,omitempty"`
	Phase      string `json:"phase,omitempty"`
	PartNumber int    `json:"partNumber,omitempty"`
	TotalParts int    `json:"totalParts,omitempty"`
	Message    string `json:"message,omitempty"`
}

type PartResult struct {
	PartNumber    int    `json:"partNumber"`
	URL           string `json:"url"`
	Size          int64  `json:"size"`
	SizeFormatted string `json:"sizeFormatted"`
}

type CompleteEvent struct {
	Type        string       `json:"type"`
	DownloadURL string       `json:"downloadUrl,omitempty"`
	Filename    string       `json:"filename,omitempty"`
	Parts       []PartResult `json:"parts,omitempty"`
	TotalParts  int          `json:"totalParts,omitempty"`
}

type VideoInfo struct {
	Index    int
	URL      string
	Filename string
	ZipName  string
	Size     int64
}

func ZipProgress(c *fiber.Ctx) error {
	id := c.Params("id")

	collection, err := GetCollectionByID(id)
	if err != nil {
		if err == sql.ErrNoRows {
			return sendSSE(c, ProgressEvent{Type: "error", Message: "Koleksiyon bulunamadı"})
		}
		return sendSSE(c, ProgressEvent{Type: "error", Message: "Veritabanı hatası"})
	}

	// SSE headers
	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("Transfer-Encoding", "chunked")

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		sendEvent := func(data interface{}) {
			jsonData, _ := json.Marshal(data)
			fmt.Fprintf(w, "data: %s\n\n", jsonData)
			w.Flush()
		}

		total := len(collection.Items)
		sendEvent(ProgressEvent{Type: "start", Total: total})

		// 1. Video boyutlarını öğren (HEAD request)
		videos := make([]VideoInfo, 0, total)
		for i, item := range collection.Items {
			sendEvent(ProgressEvent{
				Type:     "progress",
				Current:  i + 1,
				Total:    total,
				Filename: item.Filename,
				Phase:    "checking",
			})

			size := getFileSize(item.URL)
			ext := filepath.Ext(item.Filename)
			if ext == "" {
				ext = ".mp4"
			}
			baseName := strings.TrimSuffix(item.Filename, ext)
			zipName := fmt.Sprintf("%02d_%s%s", i+1, baseName, ext)

			videos = append(videos, VideoInfo{
				Index:    i,
				URL:      item.URL,
				Filename: item.Filename,
				ZipName:  zipName,
				Size:     size,
			})
		}

		// 2. Videoları parçalara grupla
		partGroups := groupVideos(videos)
		totalParts := len(partGroups)

		// 3. Her parça için zip oluştur
		parts := make([]PartResult, 0, totalParts)

		for p, group := range partGroups {
			partNum := p + 1

			sendEvent(ProgressEvent{
				Type:       "progress",
				Current:    group[0].Index + 1,
				Total:      total,
				Phase:      "creating_part",
				PartNumber: partNum,
				TotalParts: totalParts,
			})

			// Zip dosyası oluştur
			zipID := fmt.Sprintf("%s_part%d_%s", id, partNum, uuid.New().String()[:8])
			zipPath := filepath.Join("downloads", zipID+".zip")

			zipFile, err := os.Create(zipPath)
			if err != nil {
				sendEvent(ProgressEvent{Type: "error", Message: "Zip oluşturulamadı"})
				return
			}

			zipWriter := zip.NewWriter(zipFile)

			// Videoları indir ve zip'e ekle
			for _, video := range group {
				sendEvent(ProgressEvent{
					Type:       "progress",
					Current:    video.Index + 1,
					Total:      total,
					Filename:   video.Filename,
					Phase:      "downloading",
					PartNumber: partNum,
					TotalParts: totalParts,
				})

				if err := addVideoToZip(zipWriter, video); err != nil {
					log.Printf("Video eklenemedi: %s - %v", video.Filename, err)
					sendEvent(ProgressEvent{
						Type:    "warning",
						Message: video.Filename + " indirilemedi",
						Current: video.Index + 1,
						Total:   total,
					})
					continue
				}

				sendEvent(ProgressEvent{
					Type:       "progress",
					Current:    video.Index + 1,
					Total:      total,
					Filename:   video.Filename,
					Phase:      "added",
					PartNumber: partNum,
					TotalParts: totalParts,
				})
			}

			zipWriter.Close()
			zipFile.Close()

			// Dosya boyutunu al
			stat, _ := os.Stat(zipPath)
			size := stat.Size()

			parts = append(parts, PartResult{
				PartNumber:    partNum,
				URL:           "/downloads/" + zipID + ".zip",
				Size:          size,
				SizeFormatted: formatSize(size),
			})

			sendEvent(ProgressEvent{
				Type:       "progress",
				Current:    group[len(group)-1].Index + 1,
				Total:      total,
				Phase:      "part_complete",
				PartNumber: partNum,
				TotalParts: totalParts,
			})
		}

		// 4. Sonucu gönder
		if len(parts) == 1 {
			sendEvent(CompleteEvent{
				Type:        "complete",
				DownloadURL: parts[0].URL,
				Filename:    fmt.Sprintf("videos_%s.zip", id),
			})
		} else {
			sendEvent(CompleteEvent{
				Type:       "complete_multipart",
				Parts:      parts,
				TotalParts: len(parts),
			})
		}
	})

	return nil
}

func sendSSE(c *fiber.Ctx, event ProgressEvent) error {
	c.Set("Content-Type", "text/event-stream")
	data, _ := json.Marshal(event)
	return c.SendString(fmt.Sprintf("data: %s\n\n", data))
}

func getFileSize(url string) int64 {
	resp, err := http.Head(url)
	if err != nil {
		return 300 * 1024 * 1024 // 300MB varsayılan
	}
	defer resp.Body.Close()

	if resp.ContentLength > 0 {
		return resp.ContentLength
	}
	return 300 * 1024 * 1024
}

func groupVideos(videos []VideoInfo) [][]VideoInfo {
	var groups [][]VideoInfo
	var currentGroup []VideoInfo
	var currentSize int64

	for _, video := range videos {
		if currentSize+video.Size > MaxPartSize && len(currentGroup) > 0 {
			groups = append(groups, currentGroup)
			currentGroup = nil
			currentSize = 0
		}
		currentGroup = append(currentGroup, video)
		currentSize += video.Size
	}

	if len(currentGroup) > 0 {
		groups = append(groups, currentGroup)
	}

	return groups
}

func addVideoToZip(zw *zip.Writer, video VideoInfo) error {
	// Video'yu indir
	resp, err := http.Get(video.URL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	// Zip'e ekle
	writer, err := zw.Create(video.ZipName)
	if err != nil {
		return err
	}

	_, err = io.Copy(writer, resp.Body)
	return err
}

func formatSize(bytes int64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)

	switch {
	case bytes >= GB:
		return fmt.Sprintf("%.2f GB", float64(bytes)/GB)
	case bytes >= MB:
		return fmt.Sprintf("%.1f MB", float64(bytes)/MB)
	case bytes >= KB:
		return fmt.Sprintf("%.1f KB", float64(bytes)/KB)
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}
