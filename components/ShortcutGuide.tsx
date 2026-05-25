'use client';

import { useState, useEffect } from 'react';
import ShortcutModal from '@/components/ShortcutModal';

export default function ShortcutGuide() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        setOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  if (!open) return null;
  return <ShortcutModal onClose={() => setOpen(false)} />;
}
