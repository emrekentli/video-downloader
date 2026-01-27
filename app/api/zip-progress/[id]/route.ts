import { NextRequest } from 'next/server';
import { getCollection } from '@/lib/db';
import archiver from 'archiver';
import { PassThrough } from 'stream';

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

  const encoder = new TextEncoder();
  const total = items.length;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Başlangıç
      sendEvent({ type: 'start', total });

      // Archive oluştur
      const archive = archiver('zip', { zlib: { level: 5 } });
      const chunks: Buffer[] = [];
      const passThrough = new PassThrough();

      passThrough.on('data', (chunk) => chunks.push(chunk));

      archive.pipe(passThrough);

      // Her videoyu indir
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

            const buffer = await response.arrayBuffer();
            archive.append(Buffer.from(buffer), { name: fileName });

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

      // Archive'ı finalize et
      await new Promise<void>((resolve, reject) => {
        passThrough.on('finish', resolve);
        passThrough.on('error', reject);
        archive.finalize();
      });

      // Zip'i base64 olarak gönder
      const zipBuffer = Buffer.concat(chunks);
      const base64 = zipBuffer.toString('base64');

      sendEvent({
        type: 'complete',
        zipBase64: base64,
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
