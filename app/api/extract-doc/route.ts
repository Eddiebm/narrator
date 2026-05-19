import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());
  let text = '';

  try {
    if (ext === 'pdf') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pdfParse: any = (await import('pdf-parse'));
      const result = await (pdfParse.default ?? pdfParse)(buffer);
      text = result.text;
    } else if (ext === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use PDF or DOCX.' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: `Failed to extract text: ${err instanceof Error ? err.message : 'Unknown error'}` }, { status: 500 });
  }

  // Split into paragraphs, filter blanks
  const paragraphs = text
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 10);

  return NextResponse.json({ paragraphs, total: paragraphs.length });
}
