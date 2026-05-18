import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
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

function openrouter() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}

async function generateScript(
  slide: ParsedSlide,
  style: PresentationStyle,
  client: OpenAI
): Promise<string> {
  const content = [
    slide.title ? `Title: ${slide.title}` : '',
    slide.body.length ? `Slide content:\n${slide.body.join('\n')}` : '',
    slide.notes ? `Speaker notes:\n${slide.notes}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!content.trim()) return '';

  const msg = await client.chat.completions.create({
    model: 'anthropic/claude-sonnet-4.5',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `You are a world-class presentation narrator. Write a spoken voiceover for this slide (30–60 seconds when read aloud).

Style: ${STYLE_PROMPTS[style]}

Rules:
- Write for the ear, not the eye — complete sentences, natural rhythm
- Synthesise the content into a compelling narrative; don't just read bullets aloud
- No "In this slide…", "As you can see…", or meta-commentary
- End with forward momentum that sets up the next point

Slide content:
${content}

Return only the narration text. No labels, no quotes.`,
      },
    ],
  });

  return msg.choices[0].message.content?.trim() ?? '';
}

export async function POST(request: NextRequest) {
  try {
    const client = openrouter();
    const { slides, style = 'professional' } = (await request.json()) as {
      slides: ParsedSlide[];
      style: PresentationStyle;
    };

    const scripts = await Promise.all(slides.map((s) => generateScript(s, style, client)));

    return NextResponse.json({ scripts });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Generate error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
