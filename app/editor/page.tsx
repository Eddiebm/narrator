'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mic2,
  Download,
  RefreshCw,
  ArrowLeft,
  Package,
  ChevronDown,
  FileDown,
  Loader2,
} from 'lucide-react';
import type { SlideData, Voice, PresentationStyle, NarratorSession } from '@/lib/types';
import { VOICES } from '@/lib/types';
import { loadPptx } from '@/lib/idb';
import SlideCard from '@/components/SlideCard';

export default function EditorPage() {
  const router = useRouter();
  const [slides, setSlides] = useState<SlideData[]>([]);
  const [presentationName, setPresentationName] = useState('');
  const [style, setStyle] = useState<PresentationStyle>('professional');
  const [globalVoice, setGlobalVoice] = useState<Voice>('en-US-JennyNeural');
  const [globalSpeed, setGlobalSpeed] = useState(1.0);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const audioUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    const raw = localStorage.getItem('narrator-session');
    if (!raw) {
      router.replace('/');
      return;
    }
    const session: NarratorSession = JSON.parse(raw);
    setPresentationName(session.name);
    setStyle(session.style);
    setSlides(
      session.slides.map((slide, i) => ({
        ...slide,
        script: session.scripts[i] ?? '',
        voice: 'en-US-JennyNeural' as Voice,
        speed: 1.0,
        audioBlob: null,
        audioUrl: null,
        isGeneratingScript: false,
        isGeneratingAudio: false,
        error: null,
      }))
    );
  }, [router]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      audioUrlsRef.current.forEach(URL.revokeObjectURL);
    };
  }, []);

  const updateSlide = useCallback((index: number, updates: Partial<SlideData>) => {
    setSlides((prev) => prev.map((s, i) => (i === index ? { ...s, ...updates } : s)));
  }, []);

  const refineSlide = useCallback(
    async (index: number, instruction: string) => {
      const slide = slides[index];
      updateSlide(index, { isGeneratingScript: true, error: null });
      try {
        const res = await fetch('/api/refine', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: slide.script,
            instruction,
            slideTitle: slide.title,
          }),
        });
        const { script } = await res.json();
        updateSlide(index, { script, isGeneratingScript: false });
        persistScripts(index, script);
      } catch {
        updateSlide(index, {
          isGeneratingScript: false,
          error: 'Refinement failed. Try again.',
        });
      }
    },
    [slides, updateSlide]
  );

  const generateAudio = useCallback(
    async (index: number) => {
      const slide = slides[index];
      const voice = slide.voice || globalVoice;
      const speed = slide.speed || globalSpeed;
      updateSlide(index, { isGeneratingAudio: true, error: null });
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script: slide.script, voice, speed }),
        });
        if (!res.ok) throw new Error('TTS failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioUrlsRef.current.push(url);
        updateSlide(index, { audioBlob: blob, audioUrl: url, isGeneratingAudio: false });
      } catch {
        updateSlide(index, {
          isGeneratingAudio: false,
          error: 'Audio generation failed. Try again.',
        });
      }
    },
    [slides, globalVoice, globalSpeed, updateSlide]
  );

  const generateAllAudio = useCallback(async () => {
    setIsGeneratingAll(true);
    for (let i = 0; i < slides.length; i++) {
      await generateAudio(i);
    }
    setIsGeneratingAll(false);
  }, [slides, generateAudio]);

  const downloadZip = useCallback(async () => {
    const hasAudio = slides.some((s) => s.audioBlob);
    if (!hasAudio) return;

    setIsZipping(true);
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    for (const slide of slides) {
      if (!slide.audioBlob) continue;
      const num = String(slide.index + 1).padStart(2, '0');
      const safeName = slide.title.slice(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase();
      zip.file(`${num}-${safeName}.mp3`, slide.audioBlob);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${presentationName}-narration.zip`;
    a.click();
    URL.revokeObjectURL(url);
    setIsZipping(false);
  }, [slides, presentationName]);

  const exportPptx = useCallback(async () => {
    const pptxBuffer = await loadPptx();
    if (!pptxBuffer) {
      alert('Original file not found — please re-upload the presentation.');
      return;
    }
    setIsExporting(true);
    try {
      const { embedAudioInPptx } = await import('@/lib/pptx-audio');
      const result = await embedAudioInPptx(pptxBuffer, slides.map((s) => s.audioBlob));
      const url = URL.createObjectURL(result);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${presentationName}-narrated.pptx`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  }, [slides, presentationName]);

  // Persist script edits back to localStorage
  const persistScripts = (changedIndex: number, newScript: string) => {
    const raw = localStorage.getItem('narrator-session');
    if (!raw) return;
    const session: NarratorSession = JSON.parse(raw);
    session.scripts[changedIndex] = newScript;
    localStorage.setItem('narrator-session', JSON.stringify(session));
  };

  const handleScriptChange = useCallback(
    (index: number, script: string) => {
      updateSlide(index, { script });
      persistScripts(index, script);
    },
    [updateSlide]
  );

  const generatedCount = slides.filter((s) => s.audioUrl).length;

  if (!slides.length) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-surface-border">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="text-ink-muted hover:text-ink transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 mr-auto">
            <Mic2 className="w-4 h-4 text-accent-light" />
            <span className="font-medium text-sm truncate max-w-[200px]">{presentationName}</span>
            <span className="text-ink-muted text-xs ml-1">
              {slides.length} slides
            </span>
          </div>

          {/* Global voice */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted hidden sm:block">Voice</span>
            <div className="relative">
              <select
                value={globalVoice}
                onChange={(e) => setGlobalVoice(e.target.value as Voice)}
                className="appearance-none bg-surface-card border border-surface-border text-sm text-ink rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
              >
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.region}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
            </div>

            {/* Speed */}
            <div className="relative hidden sm:block">
              <select
                value={globalSpeed}
                onChange={(e) => setGlobalSpeed(parseFloat(e.target.value))}
                className="appearance-none bg-surface-card border border-surface-border text-sm text-ink rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
              >
                {[0.75, 0.9, 1.0, 1.1, 1.25].map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
            </div>
          </div>

          {/* Actions */}
          <button
            onClick={generateAllAudio}
            disabled={isGeneratingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAll ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">
              {isGeneratingAll ? 'Generating…' : 'Generate All'}
            </span>
          </button>

          <button
            onClick={downloadZip}
            disabled={generatedCount === 0 || isZipping}
            title={
              generatedCount === 0
                ? 'Generate audio first'
                : `Download ${generatedCount} MP3s as ZIP`
            }
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent disabled:opacity-40 text-sm rounded-lg font-medium transition-all"
          >
            {isZipping ? (
              <Package className="w-3.5 h-3.5 animate-pulse" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {isZipping ? 'Zipping…' : generatedCount > 0 ? `MP3s (${generatedCount})` : 'MP3s'}
            </span>
          </button>

          <button
            onClick={exportPptx}
            disabled={generatedCount === 0 || isExporting}
            title={
              generatedCount === 0
                ? 'Generate audio first'
                : `Embed ${generatedCount} narration${generatedCount !== 1 ? 's' : ''} into PPTX`
            }
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent disabled:opacity-40 text-sm rounded-lg font-medium transition-all"
          >
            {isExporting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileDown className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">
              {isExporting ? 'Exporting…' : generatedCount > 0 ? `PPTX (${generatedCount})` : 'PPTX'}
            </span>
          </button>
        </div>
      </header>

      {/* Slide list */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-4">
        {slides.map((slide, i) => (
          <SlideCard
            key={i}
            slide={slide}
            globalVoice={globalVoice}
            globalSpeed={globalSpeed}
            onScriptChange={(script) => handleScriptChange(i, script)}
            onRefine={(instruction) => refineSlide(i, instruction)}
            onGenerateAudio={() => generateAudio(i)}
            onVoiceChange={(voice) => updateSlide(i, { voice })}
            onSpeedChange={(speed) => updateSlide(i, { speed })}
          />
        ))}

        <p className="text-center text-xs text-ink-dim pb-8 mt-4">
          Audio is not persisted on page refresh — download your files before leaving.
        </p>
      </main>
    </div>
  );
}
