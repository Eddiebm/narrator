import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import type { Voice } from '@/lib/types';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { script, voice = 'nova', speed = 1.0 } = (await request.json()) as {
    script: string;
    voice: Voice;
    speed: number;
  };

  if (!script?.trim()) {
    return NextResponse.json({ error: 'No script provided' }, { status: 400 });
  }

  const audio = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice,
    input: script,
    speed: Math.min(Math.max(speed, 0.25), 4.0),
  });

  const buffer = await audio.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}
