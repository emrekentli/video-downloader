import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';
import archiver from 'archiver';
import { PassThrough } from 'stream';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const items = await getCollection(id);

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'Koleksiyon bulunamadı' }, { status: 404 });
    }

    // Zip stream oluştur
    const archive = archiver('zip', { zlib: { level: 5 } });
    const passThrough = new PassThrough();

    archive.pipe(passThrough);

    // Her videoyu fetch edip zip'e ekle
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const response = await fetch(item.url);
        if (response.ok && response.body) {
          // Dosya adını benzersiz yap
          const ext = item.filename.split('.').pop() || 'mp4';
          const baseName = item.filename.replace(/\.[^/.]+$/, '');
          const fileName = `${String(i + 1).padStart(2, '0')}_${baseName}.${ext}`;

          // Stream olarak ekle
          const buffer = await response.arrayBuffer();
          archive.append(Buffer.from(buffer), { name: fileName });
        }
      } catch (err) {
        console.error(`Failed to fetch ${item.url}:`, err);
      }
    }

    archive.finalize();

    // ReadableStream'e dönüştür
    const readable = new ReadableStream({
      start(controller) {
        passThrough.on('data', (chunk) => controller.enqueue(chunk));
        passThrough.on('end', () => controller.close());
        passThrough.on('error', (err) => controller.error(err));
      },
    });

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="videos_${id}.zip"`,
      },
    });
  } catch (error: any) {
    console.error('Zip error:', error);
    return NextResponse.json({ error: 'Zip oluşturulamadı' }, { status: 500 });
  }
}
