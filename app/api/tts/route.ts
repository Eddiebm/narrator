import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export const maxDuration = 60;

function speedToRate(speed: number): string {
  const pct = Math.round((speed - 1) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function streamToBuffer(readable: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readable.on('data', (chunk: Buffer) => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

export async function POST(request: NextRequest) {
  const { script, voice = 'en-US-JennyNeural', speed = 1.0 } = (await request.json()) as {
    script: string;
    voice: string;
    speed: number;
  };

  if (!script?.trim()) {
    return NextResponse.json({ error: 'No script provided' }, { status: 400 });
  }

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(script, { rate: speedToRate(speed) });
  const buffer = await streamToBuffer(audioStream);

  return new NextResponse(buffer.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}
