import { NextRequest } from 'next/server';
import { getCollection } from '@/lib/db';
import { createZipPath, getZipUrl, cleanupOldZips } from '@/lib/zip-storage';
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

  // Eski zip'leri temizle
  cleanupOldZips();

  const encoder = new TextEncoder();
  const total = items.length;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      sendEvent({ type: 'start', total });

      // Zip dosyası oluştur
      const { filePath, fileId } = createZipPath(id);
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 5 } });

      archive.pipe(output);

      // Videoları indir ve zip'e ekle
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

      // Archive'ı bitir
      await new Promise<void>((resolve, reject) => {
        output.on('close', resolve);
        output.on('error', reject);
        archive.finalize();
      });

      // Static URL ver
      const downloadUrl = getZipUrl(fileId);
      console.log(`[zip] Created: ${filePath}, URL: ${downloadUrl}`);

      sendEvent({
        type: 'complete',
        downloadUrl,
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
