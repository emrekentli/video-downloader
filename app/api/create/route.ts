import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createCollection } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { links, filenames } = await request.json();

    if (!links || !Array.isArray(links) || links.length === 0) {
      return NextResponse.json({ error: 'Geçerli linkler gerekli' }, { status: 400 });
    }

    const validItems: { url: string; filename: string }[] = [];

    links.forEach((link: string, index: number) => {
      if (link && typeof link === 'string' && link.trim().startsWith('http')) {
        validItems.push({
          url: link.trim(),
          filename: filenames?.[index] || link.split('/').pop() || `video_${index + 1}.mp4`
        });
      }
    });

    if (validItems.length === 0) {
      return NextResponse.json({ error: 'Geçerli link bulunamadı' }, { status: 400 });
    }

    const id = nanoid(8);
    await createCollection(id, validItems);

    return NextResponse.json({ id, count: validItems.length });
  } catch (error) {
    console.error('Create error:', error);
    return NextResponse.json({ error: 'Bir hata oluştu' }, { status: 500 });
  }
}
