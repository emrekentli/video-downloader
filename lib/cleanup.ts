import { deleteOldCollections } from './db';

const MAX_AGE_MS = 60 * 60 * 1000; // 1 saat

export async function cleanupOldData() {
  try {
    await deleteOldCollections(MAX_AGE_MS);
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

let cleanupInterval: NodeJS.Timeout | null = null;

export function startCleanupScheduler() {
  if (cleanupInterval) return;

  cleanupOldData().catch(console.error);

  cleanupInterval = setInterval(() => {
    cleanupOldData().catch(console.error);
  }, 10 * 60 * 1000);

  console.log('Cleanup scheduler started - collections expire after 1 hour');
}
