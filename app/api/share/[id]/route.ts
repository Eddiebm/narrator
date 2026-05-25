export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  let sql;
  try {
    sql = getDb();
  } catch {
    return NextResponse.json({ error: 'Sharing not configured' }, { status: 503 });
  }

  const rows = await sql`
    SELECT type, name, content, audio_url
    FROM shares
    WHERE id = ${params.id}
      AND expires_at > NOW()
  `;

  if (!rows.length) {
    return NextResponse.json({ error: 'Not found or expired' }, { status: 404 });
  }

  const row = rows[0] as {
    type: string;
    name: string;
    content: unknown;
    audio_url: string | null;
  };

  return NextResponse.json({
    type: row.type,
    name: row.name,
    content: row.content,
    audio_url: row.audio_url,
  });
}
