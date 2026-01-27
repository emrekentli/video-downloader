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
    // Dosyayı oku ve gönder
    const buffer = fs.readFileSync(filePath);

    // Gönderildikten sonra sil
    deleteTempFile(fileId);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Length': buffer.length.toString(),
        'Content-Disposition': `attachment; filename="${fileId}.zip"`,
        'Alt-Svc': 'clear',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Dosya okunamadı' }, { status: 500 });
  }
}
