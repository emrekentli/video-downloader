import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DOWNLOADS_DIR = path.join(process.cwd(), 'public', 'downloads');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const { fileId } = await params;

  // Güvenlik: path traversal engelle
  if (fileId.includes('..') || fileId.includes('/') || fileId.includes('\\')) {
    return NextResponse.json({ error: 'Geçersiz dosya' }, { status: 400 });
  }

  const filePath = path.join(DOWNLOADS_DIR, fileId);

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 });
  }

  try {
    const stats = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 }); // 1MB chunks

    const readable = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        fileStream.on('end', () => {
          controller.close();
        });
        fileStream.on('error', (err) => {
          console.error('[download] Stream error:', err);
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
        'Content-Disposition': `attachment; filename="${fileId}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error: any) {
    console.error('[download] Error:', error.message);
    return NextResponse.json({ error: 'Dosya okunamadı' }, { status: 500 });
  }
}
