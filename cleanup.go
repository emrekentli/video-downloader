package main

import (
	"log"
	"os"
	"path/filepath"
	"time"
)

const (
	MaxFileAge       = 30 * time.Minute
	MaxCollectionAge = 1 * time.Hour
)

func CleanupOldFiles() {
	// Downloads klasöründeki eski zip'leri sil
	files, err := os.ReadDir("downloads")
	if err != nil {
		return
	}

	now := time.Now()
	deletedCount := 0

	for _, file := range files {
		if file.IsDir() {
			continue
		}

		info, err := file.Info()
		if err != nil {
			continue
		}

		if now.Sub(info.ModTime()) > MaxFileAge {
			path := filepath.Join("downloads", file.Name())
			if err := os.Remove(path); err == nil {
				deletedCount++
			}
		}
	}

	if deletedCount > 0 {
		log.Printf("[cleanup] Deleted %d old zip files", deletedCount)
	}

	// Eski koleksiyonları sil
	deleted, err := DeleteOldCollections(MaxCollectionAge)
	if err == nil && deleted > 0 {
		log.Printf("[cleanup] Deleted %d old collections", deleted)
	}
}
