package main

import (
	"database/sql"
	"encoding/json"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

type VideoItem struct {
	URL      string `json:"url"`
	Filename string `json:"filename"`
}

type Collection struct {
	ID        string      `json:"id"`
	Items     []VideoItem `json:"items"`
	CreatedAt time.Time   `json:"created_at"`
}

func InitDB() error {
	var err error
	db, err = sql.Open("sqlite3", "./data.db")
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS collections (
			id TEXT PRIMARY KEY,
			items TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	return err
}

func SaveCollection(id string, items []VideoItem) error {
	itemsJSON, err := json.Marshal(items)
	if err != nil {
		return err
	}

	_, err = db.Exec(
		"INSERT OR REPLACE INTO collections (id, items, created_at) VALUES (?, ?, ?)",
		id, string(itemsJSON), time.Now(),
	)
	return err
}

func GetCollectionByID(id string) (*Collection, error) {
	var itemsJSON string
	var createdAt time.Time

	err := db.QueryRow(
		"SELECT items, created_at FROM collections WHERE id = ?",
		id,
	).Scan(&itemsJSON, &createdAt)

	if err != nil {
		return nil, err
	}

	var items []VideoItem
	if err := json.Unmarshal([]byte(itemsJSON), &items); err != nil {
		return nil, err
	}

	return &Collection{
		ID:        id,
		Items:     items,
		CreatedAt: createdAt,
	}, nil
}

func DeleteOldCollections(maxAge time.Duration) (int64, error) {
	result, err := db.Exec(
		"DELETE FROM collections WHERE created_at < ?",
		time.Now().Add(-maxAge),
	)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
