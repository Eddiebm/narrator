'use client';

import { useEffect, useRef } from 'react';

interface Props {
  title: string;
  body: string[];
  index: number;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 2,
): number {
  const words = text.split(' ');
  let line = '';
  let curY = y;
  let lineCount = 0;
  for (const word of words) {
    const test = line + word + ' ';
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line.trim(), x, curY);
      line = word + ' ';
      curY += lineHeight;
      if (++lineCount >= maxLines) break;
    } else {
      line = test;
    }
  }
  if (line.trim() && lineCount < maxLines) ctx.fillText(line.trim(), x, curY);
  return curY + lineHeight;
}

export default function SlidePreview({ title, body, index }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const scale = W / 320;

    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = '#6366f1';
    ctx.fillRect(0, 0, W, 3 * scale);

    ctx.fillStyle = '#374151';
    ctx.font = `${10 * scale}px system-ui,sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(String(index + 1), W - 10 * scale, 18 * scale);

    const pad = 12 * scale;
    const maxW = W - pad * 2;

    ctx.fillStyle = '#e5e7eb';
    ctx.textAlign = 'left';
    ctx.font = `bold ${13 * scale}px system-ui,sans-serif`;
    let y = wrapText(ctx, title || 'Untitled', pad, 30 * scale, maxW, 16 * scale, 2);

    ctx.fillStyle = '#6b7280';
    ctx.font = `${9 * scale}px system-ui,sans-serif`;
    for (const line of body.slice(0, 5)) {
      if (!line || y > H - 8 * scale) break;
      const display = line.length > 55 ? line.slice(0, 55) + '…' : line;
      ctx.fillText(display, pad, y);
      y += 13 * scale;
    }
  }, [title, body, index]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={180}
      className="w-full rounded-md border border-surface-border/60"
    />
  );
}
