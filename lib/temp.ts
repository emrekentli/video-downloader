import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';

const TEMP_DIR = path.join(os.tmpdir(), 'video-zips');
const MAX_AGE_MS = 10 * 60 * 1000; // 10 dakika

// Temp klasörünü oluştur
export function ensureTempDir() {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

// Yeni temp dosya yolu oluştur
export function createTempPath(prefix: string): string {
  ensureTempDir();
  const id = randomBytes(8).toString('hex');
  return path.join(TEMP_DIR, `${prefix}_${id}.zip`);
}

// Dosya ID'sinden path'i al
export function getTempPath(fileId: string): string | null {
  const filePath = path.join(TEMP_DIR, `${fileId}.zip`);
  if (fs.existsSync(filePath)) {
    return filePath;
  }
  return null;
}

// Dosya ID'sini path'ten çıkar
export function getFileIdFromPath(filePath: string): string {
  return path.basename(filePath, '.zip');
}

// Eski temp dosyaları temizle
export function cleanupTempFiles(): number {
  ensureTempDir();
  const now = Date.now();
  let deleted = 0;

  try {
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const filePath = path.join(TEMP_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch {
        // Dosya zaten silinmiş olabilir
      }
    }
  } catch {
    // Klasör yoksa sorun değil
  }

  if (deleted > 0) {
    console.log(`Cleaned up ${deleted} temp zip files`);
  }

  return deleted;
}

// Belirli bir dosyayı sil
export function deleteTempFile(fileId: string): boolean {
  const filePath = path.join(TEMP_DIR, `${fileId}.zip`);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    // Hata durumunda sessizce devam et
  }
  return false;
}
