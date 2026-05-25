export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { text, targetLanguage } = (await request.json()) as {
    text: string;
    targetLanguage: string;
  };

  if (!text?.trim() || !targetLanguage?.trim()) {
    return NextResponse.json({ error: 'text and targetLanguage are required' }, { status: 400 });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const prompt = `Translate the following narration script to ${targetLanguage}. Return ONLY the translated text with no commentary, no markdown, no quotes:\n\n${text}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-flash-1.5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `OpenRouter ${res.status}: ${body}` }, { status: 502 });
  }

  const data = await res.json();
  const translated = data.choices?.[0]?.message?.content?.trim() ?? '';

  return NextResponse.json({ translated });
}
