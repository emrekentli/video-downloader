import { NextRequest, NextResponse } from 'next/server';
import { getTempPath, deleteTempFile } from '@/lib/temp';
import fs from 'fs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  // Güvenlik: sadece alfanumerik ve alt çizgi kabul et
  if (!/^[a-zA-Z0-9_]+$/.test(fileId)) {
    return NextResponse.json({ error: 'Geçersiz dosya ID' }, { status: 400 });
  }

  const filePath = getTempPath(fileId);

  if (!filePath) {
    return NextResponse.json({ error: 'Dosya bulunamadı veya süresi dolmuş' }, { status: 404 });
  }

  try {
    const stats = fs.statSync(filePath);
    console.log(`[zip-download] Streaming file: ${filePath}, size: ${stats.size}`);

    // Stream olarak gönder
    const fileStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 }); // 64KB chunks

    const readable = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        fileStream.on('end', () => {
          controller.close();
          deleteTempFile(fileId);
          console.log(`[zip-download] Stream complete, file deleted`);
        });
        fileStream.on('error', (err) => {
          console.error(`[zip-download] Stream error:`, err);
          controller.error(err);
        });
      },
      cancel() {
        fileStream.destroy();
      }
    });

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': stats.size.toString(),
        'Content-Disposition': `attachment; filename="${fileId}.zip"`,
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no', // Nginx buffering'i kapat
      },
    });
  } catch (error: any) {
    console.error(`[zip-download] Error:`, error.message, error.code);
    return NextResponse.json({ error: 'Dosya okunamadı', detail: error.message }, { status: 500 });
  }
}
