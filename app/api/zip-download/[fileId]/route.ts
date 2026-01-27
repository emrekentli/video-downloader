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
    const fileStream = fs.createReadStream(filePath);

    // Stream'i ReadableStream'e dönüştür
    const readable = new ReadableStream({
      start(controller) {
        fileStream.on('data', (chunk) => {
          controller.enqueue(chunk);
        });
        fileStream.on('end', () => {
          controller.close();
          // İndirme tamamlandıktan sonra dosyayı sil
          deleteTempFile(fileId);
        });
        fileStream.on('error', (err) => {
          controller.error(err);
        });
      },
    });

    return new NextResponse(readable, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': stats.size.toString(),
        'Content-Disposition': `attachment; filename="${fileId}.zip"`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Dosya okunamadı' }, { status: 500 });
  }
}
