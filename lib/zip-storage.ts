import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

// Production'da /app/public/downloads, development'ta ./public/downloads
const DOWNLOADS_DIR = path.join(process.cwd(), 'public', 'downloads');
const MAX_AGE_MS = 30 * 60 * 1000; // 30 dakika

export function ensureDownloadsDir() {
  if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  }
}

export function createZipPath(collectionId: string): { filePath: string; fileId: string } {
  ensureDownloadsDir();
  const fileId = `${collectionId}_${randomBytes(4).toString('hex')}`;
  const filePath = path.join(DOWNLOADS_DIR, `${fileId}.zip`);
  return { filePath, fileId };
}

export function getZipUrl(fileId: string): string {
  return `/downloads/${fileId}.zip`;
}

export function cleanupOldZips(): number {
  ensureDownloadsDir();
  const now = Date.now();
  let deleted = 0;

  try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    for (const file of files) {
      if (!file.endsWith('.zip')) continue;

      const filePath = path.join(DOWNLOADS_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          deleted++;
          console.log(`[cleanup] Deleted old zip: ${file}`);
        }
      } catch {
        // Dosya zaten silinmiş olabilir
      }
    }
  } catch {
    // Klasör yoksa sorun değil
  }

  return deleted;
}

export function deleteZip(fileId: string): boolean {
  const filePath = path.join(DOWNLOADS_DIR, `${fileId}.zip`);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    // Sessizce devam
  }
  return false;
}

export function zipExists(fileId: string): boolean {
  const filePath = path.join(DOWNLOADS_DIR, `${fileId}.zip`);
  return fs.existsSync(filePath);
}
