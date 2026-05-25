'use client';

import { useState, useEffect } from 'react';
import { Trash2, Plus, X } from 'lucide-react';
import { loadDict, saveDict, type PronunciationDict } from '@/lib/pronunciation';

export default function PronunciationEditor({ onClose }: { onClose: () => void }) {
  const [dict, setDict] = useState<PronunciationDict>({});
  const [findInput, setFindInput] = useState('');
  const [replaceInput, setReplaceInput] = useState('');

  useEffect(() => {
    setDict(loadDict());
  }, []);

  function handleAdd() {
    if (!findInput.trim() || !replaceInput.trim()) return;
    const updated = { ...dict, [findInput.trim()]: replaceInput.trim() };
    setDict(updated);
    saveDict(updated);
    setFindInput('');
    setReplaceInput('');
  }

  function handleDelete(key: string) {
    const updated = { ...dict };
    delete updated[key];
    setDict(updated);
    saveDict(updated);
  }

  const entries = Object.entries(dict);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h2 className="text-ink font-semibold text-base">Pronunciation Dictionary</h2>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 scrollbar-none">
          {entries.length === 0 ? (
            <p className="text-ink-muted text-sm text-center py-6">
              No entries yet — add one below
            </p>
          ) : (
            entries.map(([find, replace]) => (
              <div
                key={find}
                className="flex items-center justify-between bg-surface rounded-lg px-3 py-2 gap-3"
              >
                <span className="text-ink text-sm flex-1 truncate">
                  <span className="text-ink-muted">{find}</span>
                  <span className="text-ink-dim mx-2">→</span>
                  <span>{replace}</span>
                </span>
                <button
                  onClick={() => handleDelete(find)}
                  className="text-ink-muted hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-4 border-t border-surface-border">
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="Find"
              value={findInput}
              onChange={e => setFindInput(e.target.value)}
              className="flex-1 bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-ink placeholder-ink-muted outline-none focus:border-accent/60"
            />
            <input
              type="text"
              placeholder="Replace"
              value={replaceInput}
              onChange={e => setReplaceInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="flex-1 bg-surface border border-surface-border rounded-lg px-3 py-2 text-sm text-ink placeholder-ink-muted outline-none focus:border-accent/60"
            />
          </div>
          <button
            onClick={handleAdd}
            className="w-full flex items-center justify-center gap-2 bg-accent/15 hover:bg-accent/25 text-accent-light rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add entry
          </button>
        </div>
      </div>
    </div>
  );
}
