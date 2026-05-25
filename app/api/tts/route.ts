export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

// msedge-tts WebSocket connections consistently time out from Vercel cloud IPs — using Google TTS REST
function voiceToLang(voice: string): string {
  if (voice.startsWith('en-AU')) return 'en-au';
  if (voice.startsWith('en-ZA')) return 'en-za';
  if (voice.startsWith('en-GB') || voice.startsWith('en-NG') || voice.startsWith('en-GH') || voice.startsWith('en-KE')) return 'en-gb';
  return 'en-us';
}

function chunkText(text: string, max = 190): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > max) {
      if (current) chunks.push(current);
      current = word.length > max ? word.slice(0, max) : word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [''];
}

async function fetchChunk(text: string, lang: string): Promise<ArrayBuffer> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
  const r = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Referer': 'https://translate.google.com/',
    },
  });
  if (!r.ok) throw new Error(`TTS ${r.status}`);
  return r.arrayBuffer();
}

function concatBuffers(buffers: ArrayBuffer[]): Uint8Array {
  const total = buffers.reduce((s, b) => s + b.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) { out.set(new Uint8Array(b), offset); offset += b.byteLength; }
  return out;
}

export async function POST(req: NextRequest) {
  const { script, voice = 'en-GB-SoniaNeural' } = await req.json() as { script: string; voice?: string; speed?: number };
  if (!script?.trim()) return NextResponse.json({ error: 'No script' }, { status: 400 });
  const lang = voiceToLang(voice);
  const chunks = chunkText(script.slice(0, 4096));
  const buffers: ArrayBuffer[] = [];
  for (const c of chunks) buffers.push(await fetchChunk(c, lang));
  const audio = concatBuffers(buffers);
  return new NextResponse(audio.buffer as ArrayBuffer, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' } });
}
