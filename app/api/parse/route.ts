import { NextRequest, NextResponse } from 'next/server';
import { parsePptx } from '@/lib/pptx';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!file.name.endsWith('.pptx')) {
    return NextResponse.json({ error: 'Only .pptx files are supported' }, { status: 400 });
  }

  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File is too large. Maximum size is 100 MB.' }, { status: 413 });
  }

  const buffer = await file.arrayBuffer();
  const slides = await parsePptx(buffer);

  return NextResponse.json({ slides, name: file.name.replace('.pptx', '') });
}
