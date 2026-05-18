import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { script, voice = 'nova', speed = 1.0 } = (await request.json()) as {
    script: string;
    voice: string;
    speed: number;
  };

  if (!script?.trim()) {
    return NextResponse.json({ error: 'No script provided' }, { status: 400 });
  }

  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const audio = await client.audio.speech.create({
    model: 'openai/gpt-4o-mini-tts',
    voice: voice as 'alloy',
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
