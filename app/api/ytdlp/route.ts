import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const { url, action } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL gerekli' }, { status: 400 });
    }

    // Video bilgilerini al
    if (action === 'info') {
      const { stdout } = await execAsync(
        `yt-dlp --dump-json "${url}"`,
        { maxBuffer: 10 * 1024 * 1024, timeout: 60000 }
      );
      const info = JSON.parse(stdout);
      return NextResponse.json({
        title: info.title,
        duration: info.duration,
        thumbnail: info.thumbnail,
        formats: info.formats?.slice(0, 10).map((f: any) => ({
          format_id: f.format_id,
          ext: f.ext,
          resolution: f.resolution || `${f.width}x${f.height}`,
          filesize: f.filesize,
        })),
      });
    }

    // Doğrudan indirme URL'si al - farklı format seçenekleri dene
    const formatOptions = [
      'best[ext=mp4]/best',
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best',
      'best'
    ];

    let directUrl = '';
    let lastError = '';

    for (const format of formatOptions) {
      try {
        const { stdout } = await execAsync(
          `yt-dlp -f "${format}" -g --no-warnings "${url}"`,
          { maxBuffer: 1024 * 1024, timeout: 60000 }
        );
        directUrl = stdout.trim().split('\n')[0];
        if (directUrl && directUrl.startsWith('http')) {
          break;
        }
      } catch (err: any) {
        lastError = err.message;
        continue;
      }
    }

    if (!directUrl || !directUrl.startsWith('http')) {
      return NextResponse.json(
        { error: `Video URL alınamadı: ${lastError}` },
        { status: 500 }
      );
    }

    // Dosya adını al
    let filename = 'video.mp4';
    try {
      const { stdout: titleOut } = await execAsync(
        `yt-dlp --get-filename -o "%(title)s.%(ext)s" --no-warnings "${url}"`,
        { maxBuffer: 1024 * 1024, timeout: 30000 }
      );
      filename = titleOut.trim().replace(/[<>:"/\\|?*]/g, '_') || 'video.mp4';
    } catch {
      // Dosya adı alınamazsa varsayılanı kullan
    }

    return NextResponse.json({
      directUrl,
      filename,
      originalUrl: url
    });
  } catch (error: any) {
    console.error('yt-dlp error:', error);
    return NextResponse.json(
      { error: error.message || 'yt-dlp hatası' },
      { status: 500 }
    );
  }
}
