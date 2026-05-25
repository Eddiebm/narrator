'use client';

import { X } from 'lucide-react';

const KBD_CLASS = 'bg-surface border border-surface-border rounded px-1.5 py-0.5 text-xs font-mono text-ink';

interface ShortcutRow {
  keys: string[];
  action: string;
}

interface Section {
  heading: string;
  rows: ShortcutRow[];
}

const SECTIONS: Section[] = [
  {
    heading: 'Playback — Reader, Script, Podcast',
    rows: [
      { keys: ['Space'], action: 'Play / Pause' },
      { keys: ['←'], action: 'Previous paragraph / line' },
      { keys: ['→'], action: 'Next paragraph / line' },
    ],
  },
  {
    heading: 'Reader voice commands (say aloud)',
    rows: [
      { keys: ['"Play"', '"Resume"'], action: 'Start reading' },
      { keys: ['"Stop"', '"Pause"'], action: 'Pause' },
      { keys: ['"Next"', '"Skip"'], action: 'Next paragraph' },
      { keys: ['"Back"', '"Previous"'], action: 'Previous paragraph' },
      { keys: ['"Repeat"'], action: 'Replay current' },
      { keys: ['"Restart"'], action: 'Go to beginning' },
      { keys: ['"Stop listening"'], action: 'Disable voice commands' },
    ],
  },
  {
    heading: 'Teleprompter — Script page',
    rows: [
      { keys: ['Space'], action: 'Start / stop scrolling' },
    ],
  },
  {
    heading: 'Global',
    rows: [
      { keys: ['?'], action: 'Show this guide' },
    ],
  },
];

export default function ShortcutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h2 className="text-ink font-semibold text-base">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6 scrollbar-none">
          {SECTIONS.map(section => (
            <div key={section.heading}>
              <h3 className="text-ink-muted text-xs font-semibold uppercase tracking-wider mb-3">
                {section.heading}
              </h3>
              <table className="w-full">
                <tbody className="divide-y divide-surface-border">
                  {section.rows.map(row => (
                    <tr key={row.action}>
                      <td className="py-2 pr-4 w-1/2">
                        <div className="flex flex-wrap gap-1">
                          {row.keys.map((k, i) => (
                            <span key={k} className="flex items-center gap-1">
                              <kbd className={KBD_CLASS}>{k}</kbd>
                              {i < row.keys.length - 1 && (
                                <span className="text-ink-dim text-xs">/</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 text-ink text-sm">{row.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
