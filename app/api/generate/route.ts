export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import type { ParsedSlide, PresentationStyle } from '@/lib/types';

export const maxDuration = 120;

const STYLE_PROMPTS: Record<PresentationStyle, string> = {
  professional:
    'Polished, confident, and authoritative. Clear structure. Suitable for boardrooms and investor audiences.',
  storytelling:
    'Narrative-driven with emotional resonance. Uses anecdotes, vivid imagery, and a story arc. Builds to a point.',
  technical:
    'Precise and evidence-based. Uses specific numbers and terminology. Explains mechanisms, not just outcomes.',
  conversational:
    'Warm and accessible, like explaining to a smart friend. Uses everyday language and rhetorical questions.',
};

const PROMPT = (style: PresentationStyle, content: string) => `You are a world-class presentation narrator. Write a spoken voiceover for this slide (30–60 seconds when read aloud).

Style: ${STYLE_PROMPTS[style]}

Rules:
- Write for the ear, not the eye — complete sentences, natural rhythm
- Synthesise the content into a compelling narrative; don't just read bullets aloud
- No "In this slide…", "As you can see…", or meta-commentary
- End with forward momentum that sets up the next point

Slide content:
${content}

Return only the narration text. No labels, no quotes.`;

async function generateWithOpenAI(content: string, style: PresentationStyle, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 300,
      messages: [{ role: 'user', content: PROMPT(style, content) }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.choices[0].message.content?.trim() ?? '';
}

async function generateWithOpenRouter(content: string, style: PresentationStyle, apiKey: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        max_tokens: 500,
        messages: [{ role: 'user', content: PROMPT(style, content) }],
      }),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (attempt + 1) * 6000;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${text}`);
    }

    const data = await res.json();
    return data.choices[0].message.content?.trim() ?? '';
  }

  throw new Error('Too many requests — please try again in a moment.');
}

export async function POST(request: NextRequest) {
  try {
    const { slide, style = 'professional' } = (await request.json()) as {
      slide: ParsedSlide;
      style: PresentationStyle;
    };

    const content = [
      slide.title ? `Title: ${slide.title}` : '',
      slide.body.length ? `Slide content:\n${slide.body.join('\n')}` : '',
      slide.notes ? `Speaker notes:\n${slide.notes}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    if (!content.trim()) return NextResponse.json({ script: '' });

    // Prefer OpenAI (faster, higher rate limits) — fall back to OpenRouter
    const openaiKey = process.env.OPENAI_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    if (openaiKey) {
      const script = await generateWithOpenAI(content, style, openaiKey);
      return NextResponse.json({ script });
    }

    if (!openrouterKey) throw new Error('No API key configured');
    const script = await generateWithOpenRouter(content, style, openrouterKey);
    return NextResponse.json({ script });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
