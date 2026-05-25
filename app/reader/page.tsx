'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Upload,
  ArrowLeft,
  ChevronDown,
  Loader2,
  Volume2,
  ClipboardPaste,
  Mic,
  MicOff,
  Download,
  Share2,
  Languages,
} from 'lucide-react';

const VOICES = [
  { id: 'nova',    label: 'Nova',    description: 'Female · Warm' },
  { id: 'shimmer', label: 'Shimmer', description: 'Female · Clear' },
  { id: 'onyx',    label: 'Onyx',    description: 'Male · Deep' },
  { id: 'echo',    label: 'Echo',    description: 'Male · Crisp' },
  { id: 'alloy',   label: 'Alloy',   description: 'Neutral · Balanced' },
  { id: 'fable',   label: 'Fable',   description: 'Male · Expressive' },
];

export default function ReaderPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const paraRefs = useRef<(HTMLParagraphElement | null)[]>([]);
  const audioUrlsRef = useRef<string[]>([]);

  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [voice, setVoice] = useState('nova');
  const [speed, setSpeed] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [isSharing, setIsSharing] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translateLang, setTranslateLang] = useState('Spanish');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const isPlayingRef = useRef(false);
  const currentIdxRef = useRef(0);
  // Cache generated audio blobs by paragraph index
  const audioCacheRef = useRef<Map<number, string>>(new Map());
  const blobCacheRef = useRef<Map<number, Blob>>(new Map());

  // Keep refs in sync so speech handler can read current values without stale closures
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      audioUrlsRef.current.forEach(URL.revokeObjectURL);
      recognitionRef.current?.stop();
    };
  }, []);

  // Scroll active paragraph into view
  useEffect(() => {
    paraRefs.current[currentIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentIdx]);

  // Keyboard: space = play/pause, arrow keys = skip
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowRight') { e.preventDefault(); skipForward(); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); skipBack(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const fetchAudio = useCallback(async (idx: number): Promise<string | null> => {
    if (audioCacheRef.current.has(idx)) return audioCacheRef.current.get(idx)!;
    const para = paragraphs[idx];
    if (!para) return null;
    try {
      const res = await fetch('/api/reader-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: para, voice, speed }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      blobCacheRef.current.set(idx, blob);
      const url = URL.createObjectURL(blob);
      audioUrlsRef.current.push(url);
      audioCacheRef.current.set(idx, url);
      return url;
    } catch {
      return null;
    }
  }, [paragraphs, voice, speed]);

  const playFrom = useCallback(async (idx: number) => {
    if (idx >= paragraphs.length) { setIsPlaying(false); return; }
    setCurrentIdx(idx);
    currentIdxRef.current = idx;
    setIsLoading(true);
    const url = await fetchAudio(idx);
    setIsLoading(false);
    if (!url) { setError('Audio failed for this paragraph.'); setIsPlaying(false); return; }

    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.onended = null; // clear before setting src to avoid stale fire
    audio.src = url;
    audio.load();         // force the element to accept the new src
    audio.onended = () => playFrom(idx + 1);

    try {
      await audio.play();
      setIsPlaying(true);
    } catch (err: unknown) {
      // AbortError is benign (src changed before play finished) — anything else is real
      if (err instanceof Error && err.name !== 'AbortError') {
        setError('Playback blocked. Tap the play button to start.');
        setIsPlaying(false);
      }
    }
    // Prefetch next paragraph
    if (idx + 1 < paragraphs.length) fetchAudio(idx + 1);
  }, [paragraphs, fetchAudio]);

  const togglePlay = useCallback(() => {
    if (!paragraphs.length) return;
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      const audio = audioRef.current;
      if (audio?.src && audio.paused && audio.readyState >= 2) {
        audio.play().then(() => setIsPlaying(true)).catch(() => playFrom(currentIdx));
      } else {
        playFrom(currentIdx);
      }
    }
  }, [isPlaying, paragraphs, currentIdx, playFrom]);

  const skipForward = useCallback(() => {
    const next = Math.min(currentIdx + 1, paragraphs.length - 1);
    playFrom(next);
  }, [currentIdx, paragraphs.length, playFrom]);

  const skipBack = useCallback(() => {
    const prev = Math.max(currentIdx - 1, 0);
    playFrom(prev);
  }, [currentIdx, playFrom]);

  const resetAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null; // kill stale closure so old content can't resurface
      audioRef.current.src = '';
    }
    audioCacheRef.current.clear();
    blobCacheRef.current.clear();
    audioUrlsRef.current.forEach(URL.revokeObjectURL);
    audioUrlsRef.current = [];
    setCurrentIdx(0);
    currentIdxRef.current = 0;
    setIsPlaying(false);
    isPlayingRef.current = false;
    setError(null);
  }, []);

  const downloadAudio = useCallback(async () => {
    if (!paragraphs.length || isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: paragraphs.length });
    try {
      const blobs: Blob[] = [];
      for (let i = 0; i < paragraphs.length; i++) {
        let blob = blobCacheRef.current.get(i);
        if (!blob) {
          const res = await fetch('/api/reader-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: paragraphs[i], voice, speed }),
          });
          if (res.ok) {
            blob = await res.blob();
            blobCacheRef.current.set(i, blob);
          }
        }
        if (blob) blobs.push(blob);
        setDownloadProgress({ current: i + 1, total: paragraphs.length });
      }
      if (!blobs.length) return;
      const combined = new Blob(blobs, { type: 'audio/mpeg' });
      const url = URL.createObjectURL(combined);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(fileName.replace(/\.[^.]+$/, '') || 'reader')}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  }, [paragraphs, voice, speed, fileName, isDownloading]);

  const handleFile = useCallback(async (file: File) => {
    resetAudio();
    setIsExtracting(true);
    setParagraphs([]);

    const formData = new FormData();
    formData.append('file', file);

    try {
      if (file.name.endsWith('.pptx')) {
        const res = await fetch('/api/parse', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Failed to parse PPTX.'); return; }
        const paras = data.slides.flatMap((s: { title: string; body: string[] }) =>
          [s.title, ...s.body].filter(Boolean)
        );
        setParagraphs(paras);
        setFileName(data.name ?? file.name);
      } else {
        const res = await fetch('/api/extract-doc', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Failed to extract text.'); return; }
        setParagraphs(data.paragraphs);
        setFileName(file.name);
      }
    } catch {
      setError('Failed to read the file. Try again.');
    } finally {
      setIsExtracting(false);
    }
  }, []);

  const handlePastedText = useCallback(() => {
    const text = pasteText.trim();
    if (!text) return;
    const paras = text
      .split(/\n{2,}|\r\n{2,}/)
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter((p) => p.length > 10);
    // If no double-line-breaks, split by single newlines
    const result = paras.length > 1 ? paras : text.split(/\n/).map((p) => p.trim()).filter((p) => p.length > 10);
    resetAudio();
    setParagraphs(result.length ? result : [text]);
    setFileName('Pasted text');
    setPasteText('');
    setShowPaste(false);
  }, [pasteText]);

  const showCommand = useCallback((label: string) => {
    setLastCommand(label);
    setTimeout(() => setLastCommand(null), 2000);
  }, []);

  // Separate ref so the onend handler can check without stale closure
  const wantListeningRef = useRef(false);

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return false;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const t = e.results[e.results.length - 1][0].transcript.toLowerCase().trim();

      if (/\b(stop listening|quiet|silence|go quiet|mute)\b/.test(t)) {
        showCommand('🔇 Stopped listening');
        wantListeningRef.current = false;
        recognitionRef.current?.stop();
        setIsListening(false);
      } else if (/\b(start listening|wake up|hey reader|listen|unmute)\b/.test(t)) {
        // already listening — just confirm
        showCommand('👂 Listening');
      } else if (/\b(stop|pause|hold on|wait)\b/.test(t)) {
        showCommand('⏸ Pause');
        audioRef.current?.pause();
        setIsPlaying(false);
      } else if (/\b(play|continue|resume|go|read)\b/.test(t)) {
        showCommand('▶ Play');
        if (audioRef.current?.paused) { audioRef.current.play(); setIsPlaying(true); }
        else playFrom(currentIdxRef.current);
      } else if (/\b(back|previous|last one|go back|before)\b/.test(t)) {
        showCommand('⏮ Back');
        audioRef.current?.pause(); setIsPlaying(false);
        const prev = Math.max(currentIdxRef.current - 1, 0);
        setCurrentIdx(prev); currentIdxRef.current = prev;
        setTimeout(() => playFrom(prev), 100);
      } else if (/\b(next|skip|forward|move on)\b/.test(t)) {
        showCommand('⏭ Next');
        audioRef.current?.pause(); setIsPlaying(false);
        const next = Math.min(currentIdxRef.current + 1, paragraphs.length - 1);
        setCurrentIdx(next); currentIdxRef.current = next;
        setTimeout(() => playFrom(next), 100);
      } else if (/\b(repeat|again|say that again|once more|replay)\b/.test(t)) {
        showCommand('🔁 Repeat');
        audioRef.current?.pause();
        audioCacheRef.current.delete(currentIdxRef.current);
        setTimeout(() => playFrom(currentIdxRef.current), 100);
      } else if (/\b(restart|beginning|start over|from the top)\b/.test(t)) {
        showCommand('⏺ Restart');
        audioRef.current?.pause(); setIsPlaying(false);
        setCurrentIdx(0); currentIdxRef.current = 0;
        setTimeout(() => playFrom(0), 100);
      }
    };

    rec.onend = () => {
      if (wantListeningRef.current) rec.start(); // auto-restart
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(`Mic error: ${e.error}`);
        wantListeningRef.current = false;
        setIsListening(false);
      }
    };

    recognitionRef.current = rec;
    wantListeningRef.current = true;
    rec.start();
    setIsListening(true);
    return true;
  }, [paragraphs.length, playFrom, showCommand]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      wantListeningRef.current = false;
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (!w.SpeechRecognition && !w.webkitSpeechRecognition) {
        setError('Voice commands not supported in this browser. Use Chrome or Edge.');
        return;
      }
      startListening();
    }
  }, [isListening, startListening]);

  // Auto-start voice commands when a document is loaded
  useEffect(() => {
    if (paragraphs.length > 0 && !wantListeningRef.current) {
      startListening();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paragraphs.length > 0]);

  const copyShare = useCallback(async () => {
    if (!paragraphs.length || isSharing) return;
    setIsSharing(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'reader',
          name: fileName || 'Document Reader',
          content: { paragraphs, voice, speed },
        }),
      });
      if (!res.ok) return;
      const { url } = await res.json() as { id: string; url: string };
      setShareLink(url);
      await navigator.clipboard.writeText(url);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2500);
    } finally {
      setIsSharing(false);
    }
  }, [paragraphs, voice, speed, fileName, isSharing]);

  const TRANSLATE_LANGUAGES = [
    'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Mandarin', 'Yoruba', 'Swahili',
  ];

  const translateAll = useCallback(async () => {
    if (!paragraphs.length || isTranslating) return;
    setIsTranslating(true);
    const translated: string[] = [];
    for (const para of paragraphs) {
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: para, targetLanguage: translateLang }),
        });
        const data = await res.json() as { translated?: string };
        translated.push(data.translated ?? para);
      } catch {
        translated.push(para);
      }
      setParagraphs([...translated, ...paragraphs.slice(translated.length)]);
    }
    setParagraphs(translated);
    resetAudio();
    setIsTranslating(false);
  }, [paragraphs, translateLang, isTranslating, resetAudio]);

  const hasDocs = paragraphs.length > 0;
  const progress = hasDocs ? Math.round(((currentIdx + 1) / paragraphs.length) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col">
      <audio ref={audioRef} />

      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-surface-border">
        <div className="max-w-3xl mx-auto px-2 sm:px-4 h-14 flex items-center gap-2 sm:gap-4 overflow-x-auto scrollbar-none">
          <button onClick={() => router.push('/')} className="text-ink-muted hover:text-ink transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5 flex-shrink-0 max-w-[120px] sm:max-w-[200px] mr-auto">
            <BookOpen className="w-4 h-4 text-accent-light" />
            <span className="font-medium text-sm truncate max-w-[200px]">
              {fileName || 'Document Reader'}
            </span>
            {hasDocs && (
              <span className="text-ink-muted text-xs ml-1">{paragraphs.length} paragraphs</span>
            )}
          </div>

          {/* Voice selector */}
          {hasDocs && (
            <>
              <div className="relative">
                <select
                  value={voice}
                  onChange={(e) => { setVoice(e.target.value); audioCacheRef.current.clear(); }}
                  className="appearance-none bg-surface-card border border-surface-border text-sm text-ink rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
                >
                  {VOICES.map((v) => (
                    <option key={v.id} value={v.id}>{v.label} · {v.description}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
              </div>

              <div className="relative hidden sm:block">
                <select
                  value={speed}
                  onChange={(e) => { setSpeed(parseFloat(e.target.value)); audioCacheRef.current.clear(); }}
                  className="appearance-none bg-surface-card border border-surface-border text-sm text-ink rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
                >
                  {[0.75, 0.9, 1.0, 1.1, 1.25].map((s) => (
                    <option key={s} value={s}>{s}×</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
              </div>
            </>
          )}

          <button
            onClick={() => { resetAudio(); setParagraphs([]); setShowPaste(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent text-sm rounded-lg font-medium transition-all"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Paste</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent text-sm rounded-lg font-medium transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{hasDocs ? 'New file' : 'Upload'}</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".pptx,.pdf,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

          {hasDocs && (
            <button
              onClick={downloadAudio}
              disabled={isDownloading}
              title={isDownloading ? `Rendering… ${downloadProgress.current}/${downloadProgress.total}` : 'Download MP3'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/90 disabled:opacity-60 text-white text-sm rounded-lg font-medium transition-all"
            >
              {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {isDownloading ? `${downloadProgress.current}/${downloadProgress.total}` : 'MP3'}
              </span>
            </button>
          )}

          {hasDocs && (
            <div className="relative">
              <button
                onClick={copyShare}
                disabled={isSharing}
                title="Share a link to this document"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent disabled:opacity-60 text-sm rounded-lg font-medium transition-all"
              >
                {isSharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">Share</span>
              </button>
              {showCopied && (
                <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs bg-surface-card border border-accent/40 text-accent-light px-2 py-0.5 rounded-full whitespace-nowrap">
                  Copied!
                </span>
              )}
            </div>
          )}

          {hasDocs && (
            <div className="flex items-center gap-1">
              <div className="relative">
                <select
                  value={translateLang}
                  onChange={(e) => setTranslateLang(e.target.value)}
                  disabled={isTranslating}
                  className="appearance-none bg-surface-card border border-surface-border text-sm text-ink rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-accent cursor-pointer disabled:opacity-50"
                >
                  {TRANSLATE_LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
              </div>
              <button
                onClick={translateAll}
                disabled={isTranslating}
                title="Translate all paragraphs"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent disabled:opacity-60 text-sm rounded-lg font-medium transition-all"
              >
                {isTranslating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isTranslating ? 'Translating…' : 'Translate'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {hasDocs && (
          <div className="h-0.5 bg-surface-border">
            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 pb-32">
        {!hasDocs && !isExtracting && !showPaste && (
          <div className="flex flex-col gap-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-surface-border rounded-2xl p-14 flex flex-col items-center gap-4 cursor-pointer hover:border-accent/50 hover:bg-surface-hover transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-surface-card border border-surface-border flex items-center justify-center">
                <Upload className="w-7 h-7 text-ink-muted" />
              </div>
              <div className="text-center">
                <p className="font-medium text-ink mb-1">Upload a document</p>
                <p className="text-sm text-ink-muted">PDF or DOCX</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-surface-border" />
              <span className="text-xs text-ink-dim">or</span>
              <div className="flex-1 h-px bg-surface-border" />
            </div>

            <button
              onClick={() => setShowPaste(true)}
              className="w-full border-2 border-dashed border-surface-border rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-accent/50 hover:bg-surface-hover transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-surface-card border border-surface-border flex items-center justify-center">
                <ClipboardPaste className="w-7 h-7 text-ink-muted" />
              </div>
              <div className="text-center">
                <p className="font-medium text-ink mb-1">Paste text</p>
                <p className="text-sm text-ink-muted">Email, article, anything</p>
              </div>
            </button>
          </div>
        )}

        {!hasDocs && !isExtracting && showPaste && (
          <div className="flex flex-col gap-4">
            <textarea
              autoFocus
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste or type anything here — email, article, report, contract…"
              rows={14}
              className="w-full bg-surface-card border border-surface-border rounded-2xl px-5 py-4 text-lg text-ink leading-relaxed focus:outline-none focus:border-accent resize-none placeholder-ink-dim"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPaste(false); setPasteText(''); }}
                className="px-4 py-2 text-sm text-ink-muted border border-surface-border rounded-lg hover:border-accent transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handlePastedText}
                disabled={!pasteText.trim()}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-all flex items-center justify-center gap-2"
              >
                <BookOpen className="w-4 h-4" />
                Read this
              </button>
            </div>
          </div>
        )}

        {isExtracting && (
          <div className="flex flex-col items-center gap-4 pt-20">
            <Loader2 className="w-8 h-8 text-accent-light animate-spin" />
            <p className="text-ink-muted text-sm">Reading document…</p>
          </div>
        )}

        {error && (
          <p className="mb-6 text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        {/* Paragraphs */}
        {hasDocs && (
          <div className="flex flex-col gap-3">
            {paragraphs.map((para, i) => (
              <p
                key={i}
                ref={(el) => { paraRefs.current[i] = el; }}
                onClick={() => playFrom(i)}
                className={`text-lg leading-relaxed rounded-xl px-5 py-4 cursor-pointer transition-all ${
                  i === currentIdx
                    ? 'bg-accent/15 border border-accent/40 text-ink'
                    : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
                }`}
              >
                {para}
              </p>
            ))}
          </div>
        )}
      </main>

      {/* Playback controls — fixed bottom bar */}
      {hasDocs && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-surface-border">
          {/* Command toast */}
          {lastCommand && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-surface-card border border-accent/40 text-accent-light text-sm font-medium px-4 py-1.5 rounded-full shadow-lg animate-pulse">
              {lastCommand}
            </div>
          )}

          <div className="max-w-3xl mx-auto px-4 py-3 sm:py-4 flex items-center gap-4">
            <span className="text-xs text-ink-muted w-20 text-right hidden sm:block">
              {currentIdx + 1} / {paragraphs.length}
            </span>

            <div className="flex items-center gap-4 sm:gap-3 mx-auto">
              <button
                onClick={skipBack}
                disabled={currentIdx === 0}
                className="w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-surface-card border border-surface-border hover:border-accent disabled:opacity-30 flex items-center justify-center transition-all"
              >
                <SkipBack className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>

              <button
                onClick={togglePlay}
                disabled={isLoading}
                className="w-16 h-16 sm:w-14 sm:h-14 rounded-full bg-accent hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center transition-all shadow-lg"
              >
                {isLoading ? (
                  <Loader2 className="w-7 h-7 sm:w-6 sm:h-6 text-white animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-7 h-7 sm:w-6 sm:h-6 text-white" />
                ) : (
                  <Play className="w-7 h-7 sm:w-6 sm:h-6 text-white ml-0.5" />
                )}
              </button>

              <button
                onClick={skipForward}
                disabled={currentIdx >= paragraphs.length - 1}
                className="w-12 h-12 sm:w-10 sm:h-10 rounded-full bg-surface-card border border-surface-border hover:border-accent disabled:opacity-30 flex items-center justify-center transition-all"
              >
                <SkipForward className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>

              <button
                onClick={toggleListening}
                title={isListening ? 'Stop voice commands' : 'Start voice commands'}
                className={`w-12 h-12 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all border ${
                  isListening
                    ? 'bg-red-500/20 border-red-500/60 text-red-400 animate-pulse'
                    : 'bg-surface-card border-surface-border hover:border-accent'
                }`}
              >
                {isListening ? <MicOff className="w-5 h-5 sm:w-4 sm:h-4" /> : <Mic className="w-5 h-5 sm:w-4 sm:h-4" />}
              </button>
            </div>

            <div className="w-20 hidden sm:flex items-center gap-1 text-xs text-ink-muted">
              <Volume2 className="w-3 h-3" />
              <span>Space to play</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
