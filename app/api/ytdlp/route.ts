import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';

const execAsync = promisify(exec);

const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(process.cwd(), 'downloads');

// Downloads klasörünü oluştur
if (!existsSync(DOWNLOADS_DIR)) {
  mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

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
      });
    }

    // Videoyu sunucuya indir
    const fileId = nanoid(12);
    const outputTemplate = path.join(DOWNLOADS_DIR, `${fileId}.%(ext)s`);

    console.log('Downloading:', url);

    // yt-dlp ile indir
    const { stdout, stderr } = await execAsync(
      `yt-dlp -f "best[ext=mp4]/best" -o "${outputTemplate}" --no-warnings --print filename "${url}"`,
      { maxBuffer: 50 * 1024 * 1024, timeout: 300000 } // 5 dakika timeout
    );

    const filename = stdout.trim().split('\n').pop() || '';

    if (!filename || !existsSync(filename)) {
      console.error('Download failed:', stderr);
      return NextResponse.json(
        { error: 'Video indirilemedi' },
        { status: 500 }
      );
    }

    // Orijinal dosya adını al
    let originalName = 'video.mp4';
    try {
      const { stdout: titleOut } = await execAsync(
        `yt-dlp --get-filename -o "%(title)s.%(ext)s" --no-warnings "${url}"`,
        { maxBuffer: 1024 * 1024, timeout: 30000 }
      );
      originalName = titleOut.trim().replace(/[<>:"/\\|?*]/g, '_') || 'video.mp4';
    } catch {
      // Varsayılanı kullan
    }

    const savedFilename = path.basename(filename);

    return NextResponse.json({
      fileId: savedFilename,
      filename: originalName,
      downloadUrl: `/api/serve/${savedFilename}`,
      originalUrl: url
    });
  } catch (error: any) {
    console.error('yt-dlp error:', error);

    if (error.message?.includes('not found') || error.message?.includes('ENOENT')) {
      return NextResponse.json(
        { error: 'yt-dlp kurulu değil' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'yt-dlp hatası' },
      { status: 500 }
    );
  }
}
