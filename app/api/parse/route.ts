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

  const buffer = await file.arrayBuffer();
  const slides = await parsePptx(buffer);

  return NextResponse.json({ slides, name: file.name.replace('.pptx', '') });
}
