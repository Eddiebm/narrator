'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mic2, Upload, FileText, Sparkles, CheckCircle2, Loader2, BookOpen, Info, Clock, Trash2, Music2, Package } from 'lucide-react';
import type { ParsedSlide, PresentationStyle, NarratorSession } from '@/lib/types';
import { STYLES } from '@/lib/types';
import { MODELS } from '@/lib/models';
import { savePptx, saveSession, listSessions, deleteSession, loadSession, clearAllSessions } from '@/lib/idb';
import type { SavedSession } from '@/lib/idb';

type Step = 'idle' | 'parsing' | 'generating' | 'done';

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [style, setStyle] = useState<PresentationStyle>('professional');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);

  useEffect(() => {
    listSessions().then(setSavedSessions).catch(() => {});
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      const isPptx = file.name.endsWith('.pptx');
      const isDocx = file.name.endsWith('.docx');
      if (!isPptx && !isDocx) {
        setError('Please upload a .pptx or .docx file.');
        return;
      }

      setError(null);
      setStep('parsing');

      try {

      let slides: ParsedSlide[];
      let name: string;

      if (isPptx) {
        // Save original file to IndexedDB so the editor can export PPTX with audio
        file.arrayBuffer().then((buf) => savePptx(buf)).catch(() => {});

        const formData = new FormData();
        formData.append('file', file);
        const parseRes = await fetch('/api/parse', { method: 'POST', body: formData });
        if (!parseRes.ok) {
          setError('Failed to parse the file. Make sure it is a valid .pptx.');
          setStep('idle');
          return;
        }
        ({ slides, name } = (await parseRes.json()) as { slides: ParsedSlide[]; name: string });
      } else {
        // DOCX — extract paragraphs, treat each as a slide
        const formData = new FormData();
        formData.append('file', file);
        const extractRes = await fetch('/api/extract-doc', { method: 'POST', body: formData });
        if (!extractRes.ok) {
          setError('Failed to read the Word document.');
          setStep('idle');
          return;
        }
        const { paragraphs } = (await extractRes.json()) as { paragraphs: string[] };
        name = file.name.replace(/\.docx$/i, '');
        slides = paragraphs.map((p, i) => ({
          index: i,
          title: p.slice(0, 60) + (p.length > 60 ? '…' : ''),
          body: [p],
          notes: '',
        }));
      }

      // 2. Generate scripts — one per request so each stays well inside edge runtime limits
      setStep('generating');
      setProgress({ current: 0, total: slides.length });

      const allScripts: string[] = [];

      for (let i = 0; i < slides.length; i++) {
        const genRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slide: slides[i], style }),
        });
        if (!genRes.ok) {
          const body = await genRes.json().catch(() => ({}));
          setError(`Script generation failed: ${body.error || genRes.status}`);
          setStep('idle');
          return;
        }
        const { script } = await genRes.json();
        allScripts.push(script ?? '');
        setProgress({ current: i + 1, total: slides.length });
        if (i < slides.length - 1) await new Promise((r) => setTimeout(r, 2000));
      }

      // 3. Save session and redirect
      const session: NarratorSession = {
        name,
        style,
        slides,
        scripts: allScripts,
        createdAt: Date.now(),
      };
      localStorage.setItem('narrator-session', JSON.stringify(session));
      saveSession(session).then(() => listSessions().then(setSavedSessions)).catch(() => {});

      setStep('done');
      setTimeout(() => router.push('/editor?autoExport=1'), 600);
      } catch (err) {
        setError(`Something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setStep('idle');
      }
    },
    [style, router]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const mergeZip = useCallback(async (file: File) => {
    if (!file.name.endsWith('.zip')) { setMergeError('Please pick the narration .zip file.'); return; }
    setIsMerging(true);
    setMergeError(null);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const mp3Files = Object.entries(zip.files)
        .filter(([name, f]) => name.toLowerCase().endsWith('.mp3') && !f.dir)
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
      if (!mp3Files.length) { setMergeError('No MP3 files found in that ZIP.'); return; }
      const blobs: Blob[] = [];
      for (const [, f] of mp3Files) {
        const buf = await f.async('arraybuffer');
        blobs.push(new Blob([buf], { type: 'audio/mpeg' }));
      }
      const combined = new Blob(blobs, { type: 'audio/mpeg' });
      const url = URL.createObjectURL(combined);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name.replace(/\.zip$/i, '') + '-combined.mp3';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : 'Failed to merge ZIP.');
    } finally {
      setIsMerging(false);
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  }, []);

  const isProcessing = step !== 'idle';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Logo + reader link */}
      <div className="flex items-center gap-2 mb-12">
        <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
          <Mic2 className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-semibold tracking-tight">Narrator</span>
        <Link
          href="/reader"
          className="ml-4 flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent text-sm text-ink-muted hover:text-ink rounded-lg transition-all"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Reader
        </Link>
      </div>

      {/* Headline */}
      <h1 className="text-3xl sm:text-4xl font-bold text-center mb-3 max-w-lg leading-tight">
        Turn your slides into a{' '}
        <span className="text-accent-light">compelling voiceover</span>
      </h1>
      <p className="text-ink-muted text-center mb-10 max-w-md">
        Upload a PowerPoint, pick a style, and get a polished narration script with AI-generated
        audio — per slide, ready to download.
      </p>

      {/* Style selector */}
      {!isProcessing && (
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                style === s.id
                  ? 'bg-accent border-accent text-white'
                  : 'border-surface-border text-ink-muted hover:border-accent hover:text-ink'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Drop zone / Progress */}
      {!isProcessing ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-14 flex flex-col items-center gap-4 cursor-pointer transition-all ${
            isDragging
              ? 'border-accent bg-accent-dim'
              : 'border-surface-border hover:border-accent/50 hover:bg-surface-hover'
          }`}
        >
          <div className="w-14 h-14 rounded-xl bg-surface-card border border-surface-border flex items-center justify-center">
            <Upload className="w-7 h-7 text-ink-muted" />
          </div>
          <div className="text-center">
            <p className="font-medium text-ink mb-1">Drop your .pptx or .docx here</p>
            <p className="text-sm text-ink-muted">or click to browse</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="*/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      ) : (
        <div className="w-full max-w-lg bg-surface-card border border-surface-border rounded-2xl p-10 flex flex-col items-center gap-6">
          <StepIndicator step={step} progress={progress} />
        </div>
      )}

      {error && (
        <p className="mt-4 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      {/* Merge narration ZIP → single MP3 */}
      {!isProcessing && (
        <div className="w-full max-w-lg mt-6">
          <div className="bg-surface-card border border-surface-border rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-hover border border-surface-border flex items-center justify-center flex-shrink-0">
              <Package className="w-4 h-4 text-ink-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink font-medium">Already have a narration ZIP?</p>
              <p className="text-xs text-ink-muted">Combine all slides into one MP3 file instantly</p>
            </div>
            <button
              onClick={() => zipInputRef.current?.click()}
              disabled={isMerging}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover border border-surface-border hover:border-accent disabled:opacity-50 text-sm rounded-lg font-medium transition-all flex-shrink-0"
            >
              {isMerging ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Music2 className="w-3.5 h-3.5" />}
              <span>{isMerging ? 'Merging…' : 'Merge ZIP'}</span>
            </button>
            <input
              ref={zipInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) mergeZip(f); }}
            />
          </div>
          {mergeError && (
            <p className="mt-2 text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-1.5">{mergeError}</p>
          )}
        </div>
      )}

      {/* Cost breakdown */}
      {!isProcessing && (
        <div className="w-full max-w-lg mt-10">
          <details className="group">
            <summary className="flex items-center gap-1.5 text-xs text-ink-dim cursor-pointer hover:text-ink-muted transition-colors list-none">
              <Info className="w-3.5 h-3.5" />
              What does this cost?
              <span className="ml-auto group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="mt-3 bg-surface-card border border-surface-border rounded-xl overflow-hidden text-xs">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="text-left px-4 py-2 text-ink-muted font-medium">Feature</th>
                    <th className="text-right px-4 py-2 text-ink-muted font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {[
                    { label: 'Script generation', detail: `${MODELS.scriptGeneration.split('/')[1]} · per slide`, cost: '~$0.006' },
                    { label: 'Script refinement', detail: `${MODELS.scriptRefinement.split('/')[1]} · per edit`, cost: '< $0.001' },
                    { label: 'Presentation TTS', detail: 'Edge TTS (Microsoft)', cost: 'Free' },
                    { label: 'Reader TTS', detail: 'Edge TTS · OpenAI HD if key set', cost: 'Free / $0.003 per para' },
                    { label: 'Podcast episode', detail: `${MODELS.scriptGeneration.split('/')[1]} · per generation`, cost: '~$0.08' },
                    { label: 'PPTX export', detail: 'Client-side processing', cost: 'Free' },
                  ].map(({ label, detail, cost }) => (
                    <tr key={label} className="hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="text-ink font-medium">{label}</p>
                        <p className="text-ink-dim">{detail}</p>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono font-semibold ${cost === 'Free' ? 'text-emerald-400' : 'text-ink'}`}>
                        {cost}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-surface-border bg-surface/40">
                    <td className="px-4 py-2.5 text-ink-muted">Typical 10-slide deck + podcast</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-ink">~$0.14</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </details>
        </div>
      )}

      {/* Recent presentations */}
      {!isProcessing && savedSessions.length > 0 && (
        <div className="w-full max-w-lg mt-8">
          <h2 className="text-xs font-medium text-ink-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Recent presentations
            <button
              type="button"
              onClick={async () => {
                await clearAllSessions();
                setSavedSessions([]);
              }}
              className="ml-auto text-xs text-ink-dim hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          </h2>
          <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
            {savedSessions.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors cursor-pointer ${
                  i < savedSessions.length - 1 ? 'border-b border-surface-border' : ''
                }`}
                onClick={async () => {
                  const record = await loadSession(s.id);
                  if (!record) return;
                  localStorage.setItem('narrator-session', JSON.stringify(record.session));
                  router.push('/editor');
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink font-medium truncate">{s.name}</p>
                  <p className="text-xs text-ink-dim capitalize">{s.style}</p>
                </div>
                <span className="text-xs text-ink-dim whitespace-nowrap">
                  {new Date(s.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
                <span className="text-xs text-ink-dim whitespace-nowrap w-16 text-right">
                  {s.slideCount} slides
                </span>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await deleteSession(s.id);
                    setSavedSessions((prev) => prev.filter((x) => x.id !== s.id));
                  }}
                  className="p-1.5 rounded-md text-ink-dim hover:text-red-400 hover:bg-red-950/30 transition-colors flex-shrink-0"
                  aria-label="Delete session"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function StepIndicator({
  step,
  progress,
}: {
  step: Step;
  progress: { current: number; total: number };
}) {
  const steps = [
    {
      id: 'parsing',
      label: 'Parsing slides',
      icon: FileText,
      done: step === 'generating' || step === 'done',
      active: step === 'parsing',
    },
    {
      id: 'generating',
      label: `Generating scripts (${progress.current}/${progress.total})`,
      icon: Sparkles,
      done: step === 'done',
      active: step === 'generating',
    },
    {
      id: 'done',
      label: 'Opening editor',
      icon: CheckCircle2,
      done: false,
      active: step === 'done',
    },
  ];

  return (
    <div className="w-full flex flex-col gap-4">
      {steps.map((s) => (
        <div key={s.id} className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
              s.done
                ? 'bg-accent text-white'
                : s.active
                ? 'bg-accent/20 text-accent-light'
                : 'bg-surface-border/40 text-ink-dim'
            }`}
          >
            {s.active ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <s.icon className="w-4 h-4" />
            )}
          </div>
          <span
            className={`text-sm ${
              s.active ? 'text-ink font-medium' : s.done ? 'text-ink-muted' : 'text-ink-dim'
            }`}
          >
            {s.label}
          </span>
        </div>
      ))}

      {step === 'generating' && progress.total > 0 && (
        <div className="mt-2 h-1.5 bg-surface-border rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full progress-bar"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
