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
  Music2,
  Video,
  Archive,
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
  const [isExportingVideo, setIsExportingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [isExportingPackage, setIsExportingPackage] = useState(false);
  const [packagePhase, setPackagePhase] = useState<string>('');
  const [exportError, setExportError] = useState<string | null>(null);
  const autoExportRef = useRef(false);
  const autoStartedRef = useRef(false);
  const wasGeneratingRef = useRef(false);
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
        voice: null,
        speed: 1.0,
        audioBlob: null,
        audioUrl: null,
        isGeneratingScript: false,
        isGeneratingAudio: false,
        error: null,
      }))
    );
    autoExportRef.current = new URLSearchParams(window.location.search).get('autoExport') === '1';
  }, [router]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      audioUrlsRef.current.forEach(URL.revokeObjectURL);
    };
  }, []);

  // Auto-start generation as soon as slides arrive (when ?autoExport=1)
  useEffect(() => {
    if (!autoExportRef.current || autoStartedRef.current || slides.length === 0) return;
    autoStartedRef.current = true;
    generateAllAudio();
  // generateAllAudio is stable once slides exist; slides.length triggers this exactly once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  // Auto-trigger package download the moment generation finishes
  useEffect(() => {
    const prev = wasGeneratingRef.current;
    wasGeneratingRef.current = isGeneratingAll;
    const doneCount = slides.filter((s) => s.audioUrl).length;
    if (prev && !isGeneratingAll && autoStartedRef.current && doneCount > 0) {
      exportPackage();
    }
  // exportPackage ref is stable; isGeneratingAll + slides are the only signals needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGeneratingAll, slides]);

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
        if (!res.ok) throw new Error('Refinement failed');
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

  const translateSlide = useCallback(
    async (index: number, targetLanguage: string) => {
      const slide = slides[index];
      updateSlide(index, { isGeneratingScript: true, error: null });
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: slide.script, targetLanguage }),
        });
        const data = await res.json() as { translated?: string; error?: string };
        if (!res.ok || !data.translated) {
          updateSlide(index, { isGeneratingScript: false, error: 'Translation failed' });
          return;
        }
        updateSlide(index, { script: data.translated, isGeneratingScript: false });
        persistScripts(index, data.translated);
      } catch {
        updateSlide(index, { isGeneratingScript: false, error: 'Translation failed' });
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
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `TTS ${res.status}`);
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        audioUrlsRef.current.push(url);
        updateSlide(index, { audioBlob: blob, audioUrl: url, isGeneratingAudio: false });
      } catch (err) {
        updateSlide(index, {
          isGeneratingAudio: false,
          error: err instanceof Error ? err.message : 'Audio generation failed. Try again.',
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

  const downloadFullAudio = useCallback(() => {
    const blobs = slides.map((s) => s.audioBlob).filter(Boolean) as Blob[];
    if (blobs.length === 0) return;
    const combined = new Blob(blobs, { type: 'audio/mpeg' });
    const url = URL.createObjectURL(combined);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${presentationName}-narration-full.mp3`;
    a.click();
    URL.revokeObjectURL(url);
  }, [slides, presentationName]);

  const exportPptx = useCallback(async () => {
    let pptxBuffer = await loadPptx();

    if (!pptxBuffer) {
      // Original wasn't saved (uploaded before this feature) — ask them to pick it
      const file = await new Promise<File | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.pptx';
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.click();
        // resolve null if they cancel (no oncancel in all browsers, handled by timeout)
        setTimeout(() => resolve(null), 60000);
      });
      if (!file) return;
      pptxBuffer = await file.arrayBuffer();
      const { savePptx } = await import('@/lib/idb');
      await savePptx(pptxBuffer);
    }

    setIsExporting(true);
    setExportError(null);
    try {
      const { embedAudioInPptx } = await import('@/lib/pptx-audio');
      const { blob, embedded, total } = await embedAudioInPptx(
        pptxBuffer,
        slides.map((s) => s.audioBlob)
      );
      if (embedded === 0) {
        setExportError(`No audio embedded (${total} slides found). Generate audio first.`);
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${presentationName}-narrated.pptx`;
      a.click();
      URL.revokeObjectURL(url);
      if (embedded < total) {
        setExportError(`Downloaded with ${embedded}/${total} slides narrated. Generate remaining audio and export again.`);
      }
    } finally {
      setIsExporting(false);
    }
  }, [slides, presentationName]);

  const exportVideo = useCallback(async () => {
    const { exportVideo: runExport } = await import('@/lib/video-export');
    setIsExportingVideo(true);
    setExportError(null);
    setVideoProgress({ current: 0, total: slides.length });
    try {
      await runExport(
        slides.map((s) => ({ title: s.title, body: s.body, audioBlob: s.audioBlob })),
        presentationName,
        (current, total) => setVideoProgress({ current, total })
      );
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Video export failed.');
    } finally {
      setIsExportingVideo(false);
      setVideoProgress({ current: 0, total: 0 });
    }
  }, [slides, presentationName]);

  const exportPackage = useCallback(async () => {
    setIsExportingPackage(true);
    setExportError(null);
    const safeName = presentationName.slice(0, 60).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // 1. Combined MP3 (instant — just concatenate blobs already in memory)
      setPackagePhase('Building MP3…');
      const audioBlobs = slides.map((s) => s.audioBlob).filter(Boolean) as Blob[];
      if (audioBlobs.length) {
        zip.file(`${safeName}-narration.mp3`, new Blob(audioBlobs, { type: 'audio/mpeg' }));
      }

      // 2. Narrated PPTX (embed audio into original PPTX client-side)
      setPackagePhase('Building narrated PPTX…');
      try {
        let pptxBuffer = await loadPptx();
        if (!pptxBuffer) {
          const file = await new Promise<File | null>((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pptx';
            input.onchange = () => resolve(input.files?.[0] ?? null);
            input.click();
            setTimeout(() => resolve(null), 60000);
          });
          if (file) {
            pptxBuffer = await file.arrayBuffer();
            const { savePptx } = await import('@/lib/idb');
            await savePptx(pptxBuffer);
          }
        }
        if (pptxBuffer) {
          const { embedAudioInPptx } = await import('@/lib/pptx-audio');
          const { blob } = await embedAudioInPptx(pptxBuffer, slides.map((s) => s.audioBlob));
          zip.file(`${safeName}-narrated.pptx`, blob);
        }
      } catch { /* skip pptx if it fails — still deliver mp3 + video */ }

      // 3. MP4 video (renders in real-time — longest step)
      setPackagePhase(`Rendering video (0/${slides.length})…`);
      try {
        const { exportVideoBlob } = await import('@/lib/video-export');
        const { blob: videoBlob, ext } = await exportVideoBlob(
          slides.map((s) => ({ title: s.title, body: s.body, audioBlob: s.audioBlob })),
          (current, total) => setPackagePhase(`Rendering video (${current}/${total})…`)
        );
        zip.file(`${safeName}-narrated.${ext}`, videoBlob);
      } catch { /* skip video if it fails */ }

      // 4. Download the package
      setPackagePhase('Packaging…');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}-narrated-package.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Package export failed.');
    } finally {
      setIsExportingPackage(false);
      setPackagePhase('');
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
      {/* Header — row 1: title + voice controls + generate */}
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-surface-border">
        <div className="max-w-4xl mx-auto px-2 sm:px-4 h-14 flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-none">
          <button
            onClick={() => router.push('/')}
            aria-label="Go back"
            className="text-ink-muted hover:text-ink transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Mic2 className="w-4 h-4 text-accent-light" />
            <span className="font-medium text-sm truncate max-w-[160px]">{presentationName}</span>
            <span className="text-ink-muted text-xs ml-1">{slides.length} slides</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={globalVoice}
                onChange={(e) => setGlobalVoice(e.target.value as Voice)}
                className="appearance-none bg-surface-card border border-surface-border text-sm text-ink rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
              >
                {VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} · {v.region}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
            </div>
            <div className="relative hidden sm:block">
              <select
                value={globalSpeed}
                onChange={(e) => setGlobalSpeed(parseFloat(e.target.value))}
                className="appearance-none bg-surface-card border border-surface-border text-sm text-ink rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
              >
                {[0.75, 0.9, 1.0, 1.1, 1.25].map((s) => (
                  <option key={s} value={s}>{s}×</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
            </div>
          </div>

          <button
            onClick={generateAllAudio}
            disabled={isGeneratingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-all flex-shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingAll ? 'animate-spin' : ''}`} />
            <span>{isGeneratingAll ? `${generatedCount}/${slides.length}…` : 'Generate All'}</span>
          </button>

          {/* Per-slide ZIP (secondary) */}
          <button
            onClick={downloadZip}
            disabled={generatedCount === 0 || isZipping}
            title={generatedCount === 0 ? 'Generate audio first' : `Download ${generatedCount} individual MP3s as ZIP`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent disabled:opacity-40 text-sm rounded-lg font-medium transition-all flex-shrink-0"
          >
            {isZipping ? <Package className="w-3.5 h-3.5 animate-pulse" /> : <Download className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isZipping ? 'Zipping…' : 'Per-slide ZIP'}</span>
          </button>
        </div>

        {/* Row 2: combined exports */}
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-2 flex items-center gap-2 border-t border-surface-border/50 overflow-x-auto scrollbar-none">
          {/* Primary: one-click full package */}
          <button
            onClick={exportPackage}
            disabled={generatedCount === 0 || isExportingPackage || isExportingVideo}
            title={generatedCount === 0 ? 'Generate audio first' : `Download MP3 + narrated PPTX + MP4 in one ZIP`}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-sm rounded-lg font-semibold transition-all flex-shrink-0"
          >
            {isExportingPackage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Package className="w-3.5 h-3.5" />}
            <span>
              {isExportingPackage
                ? packagePhase || 'Packaging…'
                : generatedCount > 0 ? `Download Package (${generatedCount} slides)` : 'Download Package'}
            </span>
          </button>

          <span className="text-ink-dim text-xs flex-shrink-0 hidden sm:block">or individually:</span>

          {/* Secondary: individual exports */}
          <button
            onClick={downloadFullAudio}
            disabled={generatedCount === 0}
            title="Combined MP3 — all slides as one audio file"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover border border-surface-border hover:border-accent disabled:opacity-40 text-sm rounded-lg font-medium transition-all flex-shrink-0"
          >
            <Music2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">MP3</span>
          </button>

          <button
            onClick={exportPptx}
            disabled={generatedCount === 0 || isExporting}
            title="Narrated PPTX — slides with embedded auto-play audio"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover border border-surface-border hover:border-accent disabled:opacity-40 text-sm rounded-lg font-medium transition-all flex-shrink-0"
          >
            {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isExporting ? 'Embedding…' : 'PPTX'}</span>
          </button>

          <button
            onClick={exportVideo}
            disabled={generatedCount === 0 || isExportingVideo || isExportingPackage}
            title="MP4 — all slides rendered as one continuous video"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-hover border border-surface-border hover:border-accent disabled:opacity-40 text-sm rounded-lg font-medium transition-all flex-shrink-0"
          >
            {isExportingVideo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">
              {isExportingVideo && videoProgress.total > 0
                ? `${videoProgress.current}/${videoProgress.total}`
                : 'MP4'}
            </span>
          </button>

          {generatedCount === 0 && (
            <span className="text-xs text-ink-muted italic">— generate audio first</span>
          )}
        </div>
      </header>

      {/* Auto-export progress banner */}
      {autoStartedRef.current && (isGeneratingAll || isExportingPackage) && (
        <div className="bg-accent/10 border-b border-accent/30 px-4 py-2 text-sm text-accent-light flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          <span>
            {isGeneratingAll
              ? `Generating narration… ${generatedCount}/${slides.length} slides`
              : packagePhase || 'Building your download package…'}
          </span>
          <span className="ml-auto text-xs text-accent-light/70">Your download will start automatically</span>
        </div>
      )}

      {/* Export error banner */}
      {exportError && (
        <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2 text-sm text-red-400 flex items-center justify-between">
          <span>{exportError}</span>
          <button onClick={() => setExportError(null)} aria-label="Dismiss error" className="ml-4 text-red-400 hover:text-red-300 transition-colors">✕</button>
        </div>
      )}

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
            onTranslate={(lang) => translateSlide(i, lang)}
          />
        ))}

        <p className="text-center text-xs text-ink-dim pb-8 mt-4">
          Audio is not persisted on page refresh — download your files before leaving.
        </p>
      </main>
    </div>
  );
}
