import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

// OpenAI TTS HD voices — most human-sounding
const OPENAI_VOICES = ['nova', 'shimmer', 'alloy', 'echo', 'onyx', 'fable'] as const;

export async function POST(req: NextRequest) {
  const { text, voice = 'nova', speed = 1.0 } = await req.json();
  if (!text?.trim()) return NextResponse.json({ error: 'No text' }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    // OpenAI TTS HD — highest quality
    const oaiVoice = OPENAI_VOICES.includes(voice as typeof OPENAI_VOICES[number]) ? voice : 'nova';
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1-hd',
        input: text.slice(0, 4096),
        voice: oaiVoice,
        speed: Math.min(Math.max(speed, 0.25), 4.0),
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `OpenAI TTS failed: ${err}` }, { status: 500 });
    }
    const buf = await res.arrayBuffer();
    return new NextResponse(buf, { headers: { 'Content-Type': 'audio/mpeg', 'X-Engine': 'openai-hd' } });
  }

  // Fallback: Edge TTS
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  const tts = new MsEdgeTTS();
  await tts.setMetadata('en-GB-SoniaNeural', OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(text.slice(0, 4096));
  const buf = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    audioStream.on('data', (c: Buffer) => chunks.push(c));
    audioStream.on('end', () => resolve(Buffer.concat(chunks)));
    audioStream.on('error', reject);
  });
  return new NextResponse(buf.buffer as ArrayBuffer, { headers: { 'Content-Type': 'audio/mpeg', 'X-Engine': 'edge-tts' } });
}
