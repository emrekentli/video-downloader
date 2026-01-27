import { NextRequest } from 'next/server';
import { getCollection } from '@/lib/db';
import { createTempPath, getFileIdFromPath, cleanupTempFiles } from '@/lib/temp';
import archiver from 'archiver';
import fs from 'fs';

export const dynamic = 'force-dynamic';

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

  // Eski temp dosyaları temizle
  cleanupTempFiles();

  const encoder = new TextEncoder();
  const total = items.length;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Başlangıç
      sendEvent({ type: 'start', total });

      // Temp dosya oluştur
      const tempPath = createTempPath(`videos_${id}`);
      const output = fs.createWriteStream(tempPath);

      // Archive oluştur - doğrudan dosyaya yaz
      const archive = archiver('zip', { zlib: { level: 5 } });
      archive.pipe(output);

      // Her videoyu indir ve stream olarak zip'e ekle
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

            // Readable stream'i direkt archive'a ver - memory'de tutmadan
            const { Readable } = await import('stream');
            const nodeStream = Readable.fromWeb(response.body as any);

            await new Promise<void>((resolve, reject) => {
              let resolved = false;
              const done = () => {
                if (!resolved) {
                  resolved = true;
                  resolve();
                }
              };
              nodeStream.on('end', done);
              nodeStream.on('close', done);
              nodeStream.on('error', reject);
              archive.append(nodeStream, { name: fileName });
            });

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

      sendEvent({ type: 'progress', current: total, total, phase: 'finalizing' });

      // Archive'ı finalize et ve dosyaya yazılmasını bekle
      await new Promise<void>((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
        archive.finalize();
      });

      // Download URL'i gönder
      const fileId = getFileIdFromPath(tempPath);
      const fileExists = fs.existsSync(tempPath);
      const fileSize = fileExists ? fs.statSync(tempPath).size : 0;
      console.log(`[zip-progress] Zip created: ${tempPath}, exists: ${fileExists}, size: ${fileSize}`);

      sendEvent({
        type: 'complete',
        downloadUrl: `/api/zip-download/${fileId}`,
        filename: `videos_${id}.zip`
      });

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
