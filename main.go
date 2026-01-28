package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/logger"
)

func main() {
	// Veritabanını başlat
	if err := InitDB(); err != nil {
		log.Fatal("DB init failed:", err)
	}

	// Downloads klasörünü oluştur
	os.MkdirAll("downloads", 0755)

	// Cleanup goroutine başlat
	go func() {
		for {
			CleanupOldFiles()
			time.Sleep(5 * time.Minute)
		}
	}()

	// Fiber app oluştur
	app := fiber.New(fiber.Config{
		BodyLimit: 10 * 1024 * 1024, // 10MB
	})

	// Middleware
	app.Use(logger.New())
	app.Use(cors.New())

	// Static dosyalar
	app.Static("/", "./static")
	app.Static("/downloads", "./downloads")

	// API routes
	api := app.Group("/api")
	api.Post("/collection", CreateCollection)
	api.Get("/collection/:id", GetCollection)
	api.Get("/zip/:id", ZipProgress)
	api.Get("/download", ProxyDownload)

	// Download page route
	app.Get("/d/:id", func(c *fiber.Ctx) error {
		return c.SendFile("./static/d.html")
	})

	// Graceful shutdown
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-c
		log.Println("Shutting down...")
		app.Shutdown()
	}()

	// Port
	port := os.Getenv("PORT")
	if port == "" {
		port = "3000"
	}

	log.Printf("Server starting on :%s", port)
	if err := app.Listen(":" + port); err != nil {
		log.Fatal(err)
	}
}
