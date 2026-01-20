import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { createCollection } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { links } = await request.json();

    if (!links || !Array.isArray(links) || links.length === 0) {
      return NextResponse.json({ error: 'Geçerli linkler gerekli' }, { status: 400 });
    }

    const validLinks = links.filter((link: string) =>
      link && typeof link === 'string' && link.trim().startsWith('http')
    );

    if (validLinks.length === 0) {
      return NextResponse.json({ error: 'Geçerli link bulunamadı' }, { status: 400 });
    }

    const id = nanoid(8);
    await createCollection(id, validLinks);

    return NextResponse.json({ id, count: validLinks.length });
  } catch (error) {
    console.error('Create error:', error);
    return NextResponse.json({ error: 'Bir hata oluştu' }, { status: 500 });
  }
}
