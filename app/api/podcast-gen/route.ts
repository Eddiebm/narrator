import { NextRequest, NextResponse } from 'next/server';
import { MODELS } from '@/lib/models';

export const maxDuration = 120;

export interface PodcastLine {
  speaker: string;
  text: string;
}

export interface Host {
  name: string;
  personality: string;
  voice: string;
}

export async function POST(req: NextRequest) {
  const { slideContent, hosts } = (await req.json()) as {
    slideContent: string; // concatenated slide text
    hosts: Host[];
  };

  if (!slideContent?.trim()) return NextResponse.json({ error: 'No content' }, { status: 400 });
  if (!hosts?.length || hosts.length < 2) return NextResponse.json({ error: 'Need at least 2 hosts' }, { status: 400 });

  const hostDescriptions = hosts
    .map((h) => `- ${h.name}: ${h.personality}`)
    .join('\n');

  const hostNames = hosts.map((h) => h.name).join(', ');

  const prompt = `You are writing a lively, engaging podcast conversation between ${hosts.length} hosts who are discussing a presentation they've just reviewed.

Hosts:
${hostDescriptions}

Rules:
- Each host speaks in their own distinct style and perspective
- They build on each other's points, sometimes agree, sometimes push back
- Ask each other genuine questions, share reactions, add context
- Reference specific points from the presentation naturally
- Keep each individual line conversational and short (1-4 sentences max) — this is spoken audio
- Aim for 20-35 exchanges total — a full 5-8 minute podcast segment
- Cover the key themes and insights from the presentation, not just a summary
- End with the hosts sharing their main takeaway

Return ONLY a JSON array with no markdown fences, no extra text. Format:
[{"speaker":"${hosts[0].name}","text":"..."},{"speaker":"${hosts[1].name}","text":"..."},...]

Presentation content:
${slideContent.slice(0, 8000)}`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODELS.scriptGeneration,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `Generation failed: ${body}` }, { status: 500 });
  }

  const data = await res.json();
  let raw = data.choices[0].message.content?.trim() ?? '';

  // Strip markdown fences if model wrapped in them
  raw = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  try {
    const lines: PodcastLine[] = JSON.parse(raw);
    return NextResponse.json({ lines });
  } catch {
    return NextResponse.json({ error: 'Failed to parse podcast script', raw }, { status: 500 });
  }
}
