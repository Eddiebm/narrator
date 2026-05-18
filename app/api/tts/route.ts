import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const ELEVENLABS_API = 'https://api.elevenlabs.io/v1';
const DEFAULT_VOICE = '21m00Tcm4TlvDq8ikWAM'; // Rachel

export async function POST(request: NextRequest) {
  const { script, voice = DEFAULT_VOICE, speed = 1.0 } = (await request.json()) as {
    script: string;
    voice: string;
    speed: number;
  };

  if (!script?.trim()) {
    return NextResponse.json({ error: 'No script provided' }, { status: 400 });
  }

  const res = await fetch(`${ELEVENLABS_API}/text-to-speech/${voice}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: script,
      model_id: 'eleven_turbo_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        speed: Math.min(Math.max(speed, 0.7), 1.2),
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('ElevenLabs error:', err);
    return NextResponse.json({ error: 'TTS generation failed' }, { status: res.status });
  }

  const buffer = await res.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  });
}
