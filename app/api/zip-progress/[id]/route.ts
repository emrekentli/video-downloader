import { NextRequest } from 'next/server';
import { getCollection } from '@/lib/db';
import { createZipPath, getZipUrl, cleanupOldZips } from '@/lib/zip-storage';
import archiver from 'archiver';
import fs from 'fs';

export const dynamic = 'force-dynamic';

const MAX_PART_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

interface VideoItem {
  url: string;
  filename: string;
}

interface PartInfo {
  partNumber: number;
  fileId: string;
  url: string;
  size: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const items = await getCollection(id);

  if (!items || items.length === 0) {
    return new Response(
      `data: ${JSON.stringify({ type: 'error', message: 'Koleksiyon bulunamadı' })}\n\n`,
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      }
    );
  }

  cleanupOldZips();

  const encoder = new TextEncoder();
  const total = items.length;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      sendEvent({ type: 'start', total });

      const parts: PartInfo[] = [];
      let currentPartNumber = 1;
      let currentPartSize = 0;
      let currentPartVideos: { index: number; item: VideoItem; buffer: Buffer; fileName: string }[] = [];

      // Tüm videoları indir ve boyutlarını öğren
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        sendEvent({
          type: 'progress',
          current: i + 1,
          total,
          filename: item.filename,
          phase: 'downloading'
        });

        try {
          const response = await fetch(item.url);
          if (response.ok && response.body) {
            const ext = item.filename.split('.').pop() || 'mp4';
            const baseName = item.filename.replace(/\.[^/.]+$/, '');
            const fileName = `${String(i + 1).padStart(2, '0')}_${baseName}.${ext}`;

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const videoSize = buffer.length;

            // Bu video mevcut parçaya sığar mı?
            if (currentPartSize + videoSize > MAX_PART_SIZE && currentPartVideos.length > 0) {
              // Mevcut parçayı kaydet
              sendEvent({ type: 'progress', current: i + 1, total, phase: 'saving_part', partNumber: currentPartNumber });
              const partInfo = await savePartZip(id, currentPartNumber, currentPartVideos);
              parts.push(partInfo);

              // Yeni parça başlat
              currentPartNumber++;
              currentPartSize = 0;
              currentPartVideos = [];
            }

            // Videoyu mevcut parçaya ekle
            currentPartVideos.push({ index: i, item, buffer, fileName });
            currentPartSize += videoSize;

            sendEvent({
              type: 'progress',
              current: i + 1,
              total,
              filename: item.filename,
              phase: 'added'
            });
          }
        } catch (err) {
          sendEvent({
            type: 'warning',
            message: `${item.filename} indirilemedi`,
            current: i + 1,
            total
          });
        }
      }

      // Son parçayı kaydet
      if (currentPartVideos.length > 0) {
        sendEvent({ type: 'progress', current: total, total, phase: 'saving_part', partNumber: currentPartNumber });
        const partInfo = await savePartZip(id, currentPartNumber, currentPartVideos);
        parts.push(partInfo);
      }

      sendEvent({ type: 'progress', current: total, total, phase: 'finalizing' });

      // Sonucu gönder
      if (parts.length === 1) {
        // Tek parça - eskisi gibi
        sendEvent({
          type: 'complete',
          downloadUrl: parts[0].url,
          filename: `videos_${id}.zip`
        });
      } else {
        // Çoklu parça
        sendEvent({
          type: 'complete_multipart',
          parts: parts.map(p => ({
            partNumber: p.partNumber,
            url: p.url,
            size: p.size,
            sizeFormatted: formatSize(p.size)
          })),
          totalParts: parts.length
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

async function savePartZip(
  collectionId: string,
  partNumber: number,
  videos: { index: number; item: VideoItem; buffer: Buffer; fileName: string }[]
): Promise<PartInfo> {
  const { filePath, fileId } = createZipPath(`${collectionId}_part${partNumber}`);
  const output = fs.createWriteStream(filePath);
  const archive = archiver('zip', { zlib: { level: 5 } });

  archive.pipe(output);

  for (const video of videos) {
    archive.append(video.buffer, { name: video.fileName });
  }

  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.finalize();
  });

  const stats = fs.statSync(filePath);

  return {
    partNumber,
    fileId,
    url: getZipUrl(fileId),
    size: stats.size
  };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
