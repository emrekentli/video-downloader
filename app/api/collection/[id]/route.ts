import { NextRequest, NextResponse } from 'next/server';
import { getCollection } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const links = await getCollection(id);

    if (!links) {
      return NextResponse.json({ error: 'Koleksiyon bulunamadı' }, { status: 404 });
    }

    return NextResponse.json({ links });
  } catch (error) {
    console.error('Get collection error:', error);
    return NextResponse.json({ error: 'Bir hata oluştu' }, { status: 500 });
  }
}
