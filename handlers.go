package main

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type CreateCollectionRequest struct {
	Items []VideoItem `json:"items"`
}

func CreateCollection(c *fiber.Ctx) error {
	var req CreateCollectionRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "Geçersiz istek"})
	}

	if len(req.Items) == 0 {
		return c.Status(400).JSON(fiber.Map{"error": "En az bir video gerekli"})
	}

	// ID oluştur (kısa)
	id := strings.Split(uuid.New().String(), "-")[0]

	if err := SaveCollection(id, req.Items); err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "Kayıt başarısız"})
	}

	return c.JSON(fiber.Map{
		"id":  id,
		"url": "/d/" + id,
	})
}

func GetCollection(c *fiber.Ctx) error {
	id := c.Params("id")

	collection, err := GetCollectionByID(id)
	if err != nil {
		if err == sql.ErrNoRows {
			return c.Status(404).JSON(fiber.Map{"error": "Koleksiyon bulunamadı"})
		}
		return c.Status(500).JSON(fiber.Map{"error": "Veritabanı hatası"})
	}

	return c.JSON(collection)
}

func ServeDownload(c *fiber.Ctx) error {
	filename := c.Params("filename")

	// Güvenlik: path traversal engelle
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") {
		return c.Status(400).JSON(fiber.Map{"error": "Geçersiz dosya"})
	}

	filepath := "./downloads/" + filename

	// Dosya var mı kontrol et
	stat, err := os.Stat(filepath)
	if err != nil {
		return c.Status(404).JSON(fiber.Map{"error": "Dosya bulunamadı"})
	}

	// Header'ları ayarla
	c.Set("Content-Type", "application/zip")
	c.Set("Content-Length", fmt.Sprintf("%d", stat.Size()))
	c.Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	c.Set("Accept-Ranges", "bytes")

	return c.SendFile(filepath)
}

func ProxyDownload(c *fiber.Ctx) error {
	url := c.Query("url")
	filename := c.Query("filename")

	if url == "" {
		return c.Status(400).JSON(fiber.Map{"error": "URL gerekli"})
	}

	if filename == "" {
		filename = "video.mp4"
	}

	// Video'yu indir ve proxy olarak gönder
	resp, err := http.Get(url)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "İndirme başarısız"})
	}
	defer resp.Body.Close()

	c.Set("Content-Type", resp.Header.Get("Content-Type"))
	c.Set("Content-Length", resp.Header.Get("Content-Length"))
	c.Set("Content-Disposition", "attachment; filename=\""+filename+"\"")

	return c.SendStream(resp.Body)
}
