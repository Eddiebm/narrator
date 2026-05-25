'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mic2, BookOpen, FileText, Radio } from 'lucide-react';

const LINKS = [
  { href: '/',         label: 'Narrator',      icon: Mic2 },
  { href: '/reader',   label: 'Reader',         icon: BookOpen },
  { href: '/script',   label: 'Script',         icon: FileText },
  { href: '/podcast',  label: 'Podcast',        icon: Radio },
];

// Pages that have their own full header — don't show the global nav
const NO_NAV = ['/editor'];

export default function GlobalNav() {
  const path = usePathname();
  if (NO_NAV.some(p => path.startsWith(p))) return null;

  return (
    <nav className="sticky top-0 z-20 bg-surface/90 backdrop-blur border-b border-surface-border">
      <div className="max-w-4xl mx-auto px-4 h-12 flex items-center gap-1 overflow-x-auto scrollbar-none">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-accent/15 text-accent-light'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
