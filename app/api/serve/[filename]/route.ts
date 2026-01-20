import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, existsSync, statSync, unlinkSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(process.cwd(), 'downloads');

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const filePath = path.join(DOWNLOADS_DIR, filename);

    // Güvenlik: path traversal engelle
    if (!filePath.startsWith(DOWNLOADS_DIR)) {
      return NextResponse.json({ error: 'Geçersiz dosya' }, { status: 400 });
    }

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 404 });
    }

    const stat = statSync(filePath);
    const originalName = request.nextUrl.searchParams.get('name') || filename;

    // Dosyayı stream olarak oku
    const stream = createReadStream(filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;

    // İndirme tamamlandıktan sonra dosyayı sil (opsiyonel - disk tasarrufu)
    stream.on('end', () => {
      setTimeout(() => {
        try {
          if (existsSync(filePath)) {
            unlinkSync(filePath);
            console.log('Deleted:', filePath);
          }
        } catch (err) {
          console.error('Delete error:', err);
        }
      }, 5000); // 5 saniye sonra sil
    });

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(originalName)}"`,
        'Content-Length': stat.size.toString(),
      },
    });
  } catch (error: any) {
    console.error('Serve error:', error);
    return NextResponse.json({ error: 'Dosya sunulamadı' }, { status: 500 });
  }
}
