export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Blob storage not configured' }, { status: 503 });
  }

  let sql;
  try {
    sql = getDb();
  } catch {
    return NextResponse.json({ error: 'Sharing not configured' }, { status: 503 });
  }

  const formData = await req.formData();
  const audioBlob = formData.get('audio') as Blob | null;
  const shareId = formData.get('shareId') as string | null;
  const name = formData.get('name') as string | null;

  if (!audioBlob || !shareId) {
    return NextResponse.json({ error: 'Missing audio or shareId' }, { status: 400 });
  }

  const { url } = await put(
    `podcasts/${shareId}.mp3`,
    audioBlob,
    { access: 'public' },
  );

  await sql`
    UPDATE shares SET audio_url = ${url} WHERE id = ${shareId}
  `;

  return NextResponse.json({ audioUrl: url, name });
}
