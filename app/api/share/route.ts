export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req: NextRequest) {
  let sql;
  try {
    sql = getDb();
  } catch {
    return NextResponse.json({ error: 'Sharing not configured' }, { status: 503 });
  }

  const body = await req.json() as {
    type: 'reader' | 'podcast' | 'script';
    name: string;
    content: object;
  };

  await sql`
    CREATE TABLE IF NOT EXISTS shares (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      content JSONB NOT NULL,
      audio_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
    )
  `;

  const rows = await sql`
    INSERT INTO shares (type, name, content)
    VALUES (${body.type}, ${body.name}, ${JSON.stringify(body.content)})
    RETURNING id
  `;

  const id = (rows[0] as { id: string }).id;
  const host = req.headers.get('host') ?? 'localhost:3010';
  const proto = req.headers.get('x-forwarded-proto') ?? 'http';
  const url = `${proto}://${host}/share/${id}`;

  return NextResponse.json({ id, url });
}
