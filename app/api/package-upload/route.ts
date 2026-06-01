export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: 'Blob storage not configured' }, { status: 503 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as Blob | null;
  const name = (formData.get('name') as string | null) ?? 'narrator-package';

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const safe = name.replace(/[^a-z0-9\-_]/gi, '-').toLowerCase();
  const { url } = await put(`packages/${safe}-${Date.now()}.zip`, file, {
    access: 'public',
    contentType: 'application/zip',
  });

  return NextResponse.json({ url });
}
