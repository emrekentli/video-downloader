import { readdirSync, statSync, unlinkSync, existsSync } from 'fs';
import path from 'path';
import { deleteOldCollections } from './db';

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(process.cwd(), 'downloads');
const MAX_AGE_MS = 60 * 60 * 1000; // 1 saat

export async function cleanupOldFiles() {
  // İndirilen dosyaları temizle
  if (existsSync(DOWNLOADS_DIR)) {
    try {
      const files = readdirSync(DOWNLOADS_DIR);
      const now = Date.now();

      for (const file of files) {
        const filePath = path.join(DOWNLOADS_DIR, file);
        try {
          const stat = statSync(filePath);
          const age = now - stat.mtimeMs;

          if (age > MAX_AGE_MS) {
            unlinkSync(filePath);
            console.log(`Cleaned up old file: ${file}`);
          }
        } catch (err) {
          // Dosya silinmiş olabilir
        }
      }
    } catch (err) {
      console.error('File cleanup error:', err);
    }
  }

  // Eski koleksiyonları temizle
  try {
    await deleteOldCollections(MAX_AGE_MS);
  } catch (err) {
    console.error('Collection cleanup error:', err);
  }
}

// Her 10 dakikada bir temizlik yap
let cleanupInterval: NodeJS.Timeout | null = null;

export function startCleanupScheduler() {
  if (cleanupInterval) return;

  // İlk temizlik (async)
  cleanupOldFiles().catch(console.error);

  // Periyodik temizlik
  cleanupInterval = setInterval(() => {
    cleanupOldFiles().catch(console.error);
  }, 10 * 60 * 1000);

  console.log('Cleanup scheduler started - files expire after 1 hour');
}
