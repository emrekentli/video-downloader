FROM golang:1.22-alpine AS builder

WORKDIR /app

# CGO için gerekli (SQLite)
RUN apk add --no-cache gcc musl-dev

COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./
RUN CGO_ENABLED=1 GOOS=linux go build -o video-zip-service .

FROM alpine:latest

WORKDIR /app

# SSL sertifikaları (HTTPS istekleri için)
RUN apk add --no-cache ca-certificates

COPY --from=builder /app/video-zip-service .
COPY static ./static

RUN mkdir -p downloads

EXPOSE 3000

CMD ["./video-zip-service"]
