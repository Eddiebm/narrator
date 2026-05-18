import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { script, instruction, slideTitle } = (await request.json()) as {
    script: string;
    instruction: string;
    slideTitle: string;
  };

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `You are editing a presentation voiceover script. Apply the instruction below to revise the script.

Slide: "${slideTitle}"

Current script:
${script}

Instruction: ${instruction}

Rules:
- Keep it natural for spoken delivery
- Maintain roughly the same length unless the instruction implies a change
- Return only the revised narration text, nothing else`,
      },
    ],
  });

  const revised = (msg.content[0] as { type: string; text: string }).text.trim();
  return NextResponse.json({ script: revised });
}
