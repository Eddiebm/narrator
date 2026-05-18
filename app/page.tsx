'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Mic2, Upload, FileText, Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import type { ParsedSlide, PresentationStyle, NarratorSession } from '@/lib/types';
import { STYLES } from '@/lib/types';

type Step = 'idle' | 'parsing' | 'generating' | 'done';

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState<Step>('idle');
  const [style, setStyle] = useState<PresentationStyle>('professional');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.pptx')) {
        setError('Please upload a .pptx file.');
        return;
      }

      setError(null);
      setStep('parsing');

      // 1. Parse the PPTX
      const formData = new FormData();
      formData.append('file', file);

      const parseRes = await fetch('/api/parse', { method: 'POST', body: formData });
      if (!parseRes.ok) {
        setError('Failed to parse the file. Make sure it is a valid .pptx.');
        setStep('idle');
        return;
      }

      const { slides, name } = (await parseRes.json()) as {
        slides: ParsedSlide[];
        name: string;
      };

      // 2. Generate scripts
      setStep('generating');
      setProgress({ current: 0, total: slides.length });

      // Generate in batches of 5 to show incremental progress
      const batchSize = 5;
      const allScripts: string[] = [];

      for (let i = 0; i < slides.length; i += batchSize) {
        const batch = slides.slice(i, i + batchSize);
        const genRes = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slides: batch, style }),
        });
        const { scripts } = await genRes.json();
        allScripts.push(...scripts);
        setProgress({ current: Math.min(i + batchSize, slides.length), total: slides.length });
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

      setStep('done');
      setTimeout(() => router.push('/editor'), 600);
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

  const isProcessing = step !== 'idle';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Logo */}
      <div className="flex items-center gap-2 mb-12">
        <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center">
          <Mic2 className="w-5 h-5 text-white" />
        </div>
        <span className="text-xl font-semibold tracking-tight">Narrator</span>
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
            <p className="font-medium text-ink mb-1">Drop your .pptx here</p>
            <p className="text-sm text-ink-muted">or click to browse</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pptx"
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
