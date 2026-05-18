import { NextRequest, NextResponse } from 'next/server';
import { MODELS } from '@/lib/models';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const { script, instruction, slideTitle } = (await request.json()) as {
    script: string;
    instruction: string;
    slideTitle: string;
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODELS.scriptRefinement,
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
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `OpenRouter ${res.status}: ${body}` }, { status: 500 });
  }

  const data = await res.json();
  const revised = data.choices[0].message.content?.trim() ?? '';
  return NextResponse.json({ script: revised });
}
