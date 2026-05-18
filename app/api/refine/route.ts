import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const { script, instruction, slideTitle } = (await request.json()) as {
    script: string;
    instruction: string;
    slideTitle: string;
  };

  const msg = await client.chat.completions.create({
    model: 'anthropic/claude-sonnet-4.5',
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

  const revised = msg.choices[0].message.content?.trim() ?? '';
  return NextResponse.json({ script: revised });
}
