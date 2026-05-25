'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Upload, Mic2, Play, Pause, SkipBack, SkipForward,
  Loader2, ChevronDown, RefreshCw, Download, Plus, Trash2,
  Share2, Rss,
} from 'lucide-react';
import type { PodcastLine, Host } from '@/app/api/podcast-gen/route';
import { applyDict, loadDict } from '@/lib/pronunciation';

// ── Voice pool ──────────────────────────────────────────────────────────────
const VOICES = [
  { id: 'en-GB-RyanNeural',        name: 'Ryan',        region: 'British Male' },
  { id: 'en-GB-SoniaNeural',       name: 'Sonia',       region: 'British Female' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher', region: 'American Male' },
  { id: 'en-US-JennyNeural',       name: 'Jenny',       region: 'American Female' },
  { id: 'en-AU-WilliamNeural',     name: 'William',     region: 'Australian Male' },
  { id: 'en-AU-NatashaNeural',     name: 'Natasha',     region: 'Australian Female' },
  { id: 'en-NG-AbeoNeural',        name: 'Abeo',        region: 'Nigerian Male' },
  { id: 'en-NG-EzinneNeural',      name: 'Ezinne',      region: 'Nigerian Female' },
  { id: 'en-GH-NanaNeural',        name: 'Nana',        region: 'Ghanaian Female' },
  { id: 'en-KE-ChilembaNeural',    name: 'Chilemba',    region: 'Kenyan Male' },
  { id: 'en-ZA-LukeNeural',        name: 'Luke',        region: 'S. African Male' },
  { id: 'en-ZA-LeahNeural',        name: 'Leah',        region: 'S. African Female' },
];

const PERSONALITIES = [
  'Thoughtful analyst who asks probing questions and connects big-picture themes',
  'Enthusiastic optimist who highlights opportunities and gets excited about ideas',
  'Constructive skeptic who challenges assumptions and plays devil\'s advocate',
  'Pragmatist who focuses on real-world implementation and practical impact',
  'Storyteller who draws on analogies, examples, and human interest angles',
  'Data-driven thinker who references evidence and wants to see the numbers',
];

const DEFAULT_HOSTS: Host[] = [
  { name: 'Alex', personality: PERSONALITIES[0], voice: VOICES[0].id },
  { name: 'Jordan', personality: PERSONALITIES[1], voice: VOICES[1].id },
];

// ── Host avatar colours ──────────────────────────────────────────────────────
const AVATAR_COLOURS = [
  'bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500',
];

type Step = 'setup' | 'generating' | 'player';

export default function PodcastPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<number, string>>(new Map());
  const blobCacheRef = useRef<Map<number, Blob>>(new Map());
  const audioUrlsRef = useRef<string[]>([]);
  const lineRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [step, setStep] = useState<Step>('setup');
  const [hosts, setHosts] = useState<Host[]>(DEFAULT_HOSTS);
  const [slideContent, setSlideContent] = useState('');
  const [deckName, setDeckName] = useState('');
  const [lines, setLines] = useState<PodcastLine[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });
  const [isSharing, setIsSharing] = useState(false);
  const [shareId, setShareId] = useState<string | null>(null);
  const [showCopied, setShowCopied] = useState(false);

  const currentIdxRef = useRef(0);
  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);

  useEffect(() => {
    // Try to load existing session from narrator
    const raw = localStorage.getItem('narrator-session');
    if (raw) {
      try {
        const session = JSON.parse(raw);
        const content = session.slides
          .map((s: { title: string; body: string[] }) => `${s.title}\n${s.body.join('\n')}`)
          .join('\n\n');
        setSlideContent(content);
        setDeckName(session.name);
      } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    return () => { audioUrlsRef.current.forEach(URL.revokeObjectURL); };
  }, []);

  // Scroll active line into view
  useEffect(() => {
    lineRefs.current[currentIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentIdx]);

  const handleFile = useCallback(async (file: File) => {
    setIsParsing(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      if (file.name.endsWith('.pptx')) {
        const res = await fetch('/api/parse', { method: 'POST', body: formData });
        if (!res.ok) { setError('Failed to parse file.'); return; }
        const { slides, name } = await res.json();
        const content = slides
          .map((s: { title: string; body: string[] }) => `${s.title}\n${s.body.join('\n')}`)
          .join('\n\n');
        setSlideContent(content);
        setDeckName(name);
      } else {
        const res = await fetch('/api/extract-doc', { method: 'POST', body: formData });
        if (!res.ok) { setError('Failed to extract text.'); return; }
        const data = await res.json();
        setSlideContent(data.paragraphs?.join('\n\n') ?? '');
        setDeckName(file.name);
      }
    } catch { setError('Failed to read file.'); }
    finally { setIsParsing(false); }
  }, []);

  const generate = useCallback(async () => {
    if (!slideContent.trim()) { setError('Upload or load a deck first.'); return; }
    setStep('generating');
    setError(null);
    audioCacheRef.current.clear();
    blobCacheRef.current.clear();
    audioUrlsRef.current.forEach(URL.revokeObjectURL);
    audioUrlsRef.current = [];

    try {
      const res = await fetch('/api/podcast-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slideContent, hosts }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Generation failed.'); setStep('setup'); return; }
      setLines(data.lines);
      setCurrentIdx(0);
      currentIdxRef.current = 0;
      setStep('player');
    } catch { setError('Generation failed.'); setStep('setup'); }
  }, [slideContent, hosts]);

  // ── Audio playback ────────────────────────────────────────────────────────
  const fetchAudio = useCallback(async (idx: number): Promise<string | null> => {
    if (audioCacheRef.current.has(idx)) return audioCacheRef.current.get(idx)!;
    const line = lines[idx];
    if (!line) return null;
    const host = hosts.find(h => h.name === line.speaker);
    const voice = host?.voice ?? VOICES[0].id;
    try {
      const processedText = applyDict(line.text, loadDict());
      const res = await fetch('/api/reader-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: processedText, voice, speed }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      blobCacheRef.current.set(idx, blob);
      const url = URL.createObjectURL(blob);
      audioUrlsRef.current.push(url);
      audioCacheRef.current.set(idx, url);
      return url;
    } catch { return null; }
  }, [lines, hosts, speed]);

  const playFrom = useCallback(async (idx: number) => {
    if (idx >= lines.length) { setIsPlaying(false); return; }
    setCurrentIdx(idx);
    currentIdxRef.current = idx;
    setIsLoading(true);
    const url = await fetchAudio(idx);
    setIsLoading(false);

    const audio = audioRef.current;
    if (!audio || !url) { playFrom(idx + 1); return; }

    audio.pause();
    audio.onended = null;
    audio.src = url;
    audio.load();
    audio.onended = () => playFrom(idx + 1);

    try {
      await audio.play();
      setIsPlaying(true);
      if (idx + 1 < lines.length) fetchAudio(idx + 1);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setIsPlaying(false);
      }
    }
  }, [lines, fetchAudio]);

  const togglePlay = useCallback(() => {
    if (!lines.length) return;
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
  }, [isPlaying, lines, currentIdx, playFrom]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (step !== 'player') return;
      if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
      if (e.code === 'ArrowRight') { e.preventDefault(); playFrom(currentIdxRef.current + 1); }
      if (e.code === 'ArrowLeft') { e.preventDefault(); playFrom(Math.max(currentIdxRef.current - 1, 0)); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [step, togglePlay, playFrom]);

  // Download full transcript as text
  const downloadTranscript = useCallback(() => {
    const text = lines.map(l => `${l.speaker}: ${l.text}`).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${deckName || 'podcast'}-transcript.txt`; a.click();
    URL.revokeObjectURL(url);
  }, [lines, deckName]);

  const downloadAudio = useCallback(async () => {
    if (!lines.length || isDownloading) return;
    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: lines.length });
    try {
      const blobs: Blob[] = [];
      for (let i = 0; i < lines.length; i++) {
        let blob = blobCacheRef.current.get(i);
        if (!blob) {
          const line = lines[i];
          const host = hosts.find(h => h.name === line.speaker);
          const voice = host?.voice ?? VOICES[0].id;
          const res = await fetch('/api/reader-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: line.text, voice, speed }),
          });
          if (res.ok) {
            blob = await res.blob();
            blobCacheRef.current.set(i, blob);
          }
        }
        if (blob) blobs.push(blob);
        setDownloadProgress({ current: i + 1, total: lines.length });
      }
      if (!blobs.length) return;
      const combined = new Blob(blobs, { type: 'audio/mpeg' });
      const url = URL.createObjectURL(combined);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(deckName || 'podcast')}-episode.mp3`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  }, [lines, hosts, speed, deckName, isDownloading]);

  const handleShare = useCallback(async () => {
    if (!lines.length || isSharing) return;
    setIsSharing(true);
    try {
      // 1. Create the share record
      const shareRes = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'podcast',
          name: deckName || 'Podcast',
          content: { lines, hosts },
        }),
      });
      if (!shareRes.ok) return;
      const { id, url } = await shareRes.json() as { id: string; url: string };
      setShareId(id);

      // 2. Render all audio blobs
      const blobs: Blob[] = [];
      for (let i = 0; i < lines.length; i++) {
        let blob = blobCacheRef.current.get(i);
        if (!blob) {
          const line = lines[i];
          const host = hosts.find(h => h.name === line.speaker);
          const voice = host?.voice ?? VOICES[0].id;
          const res = await fetch('/api/reader-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: line.text, voice, speed }),
          });
          if (res.ok) {
            blob = await res.blob();
            blobCacheRef.current.set(i, blob);
          }
        }
        if (blob) blobs.push(blob);
      }

      if (blobs.length) {
        const combined = new Blob(blobs, { type: 'audio/mpeg' });
        const formData = new FormData();
        formData.append('audio', combined);
        formData.append('shareId', id);
        formData.append('name', deckName || 'Podcast');
        await fetch('/api/podcast-upload', { method: 'POST', body: formData });
      }

      // 3. Copy to clipboard
      await navigator.clipboard.writeText(url);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2500);
    } finally {
      setIsSharing(false);
    }
  }, [lines, hosts, speed, deckName, isSharing]);

  const hostColour = (name: string) => {
    const idx = hosts.findIndex(h => h.name === name);
    return AVATAR_COLOURS[idx % AVATAR_COLOURS.length];
  };

  const chapters = useMemo(() => {
    let elapsed = 0;
    return lines.map(line => {
      const secs = Math.ceil(line.text.split(' ').length / 2.5);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      const timestamp = `${mm}:${ss}`;
      elapsed += secs;
      return { timestamp, speaker: line.speaker, preview: line.text.slice(0, 70) + (line.text.length > 70 ? '…' : '') };
    });
  }, [lines]);

  // ── SETUP ─────────────────────────────────────────────────────────────────
  if (step === 'setup') return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-surface-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <button onClick={() => router.push('/')} className="text-ink-muted hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5 mr-auto">
            <Mic2 className="w-4 h-4 text-accent-light" />
            <span className="font-medium text-sm">Podcast Generator</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 flex flex-col gap-8">

        {/* Deck source */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Presentation deck</h2>
            {deckName && <span className="text-xs text-accent-light font-medium">{deckName} ✓</span>}
          </div>

          {slideContent ? (
            <div className="flex items-center gap-3">
              <div className="flex-1 text-sm text-ink-muted bg-surface border border-surface-border rounded-lg px-3 py-2 truncate">
                {deckName || 'Loaded from narrator session'}
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-2 text-sm border border-surface-border rounded-lg hover:border-accent transition-all text-ink-muted"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
              className="flex items-center justify-center gap-2 border-2 border-dashed border-surface-border rounded-xl p-8 hover:border-accent/50 hover:bg-surface-hover transition-all cursor-pointer disabled:opacity-50"
            >
              {isParsing ? <Loader2 className="w-5 h-5 animate-spin text-ink-muted" /> : <Upload className="w-5 h-5 text-ink-muted" />}
              <span className="text-sm text-ink-muted">{isParsing ? 'Parsing…' : 'Upload a PPTX'}</span>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept=".pptx,.pdf,.docx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
        </div>

        {/* Hosts */}
        <div className="bg-surface-card border border-surface-border rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">Podcast hosts</h2>
            {hosts.length < 4 && (
              <button
                onClick={() => setHosts(h => [...h, {
                  name: `Host ${h.length + 1}`,
                  personality: PERSONALITIES[h.length % PERSONALITIES.length],
                  voice: VOICES[(h.length * 2) % VOICES.length].id,
                }])}
                className="flex items-center gap-1 text-xs text-accent-light hover:text-accent transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add host
              </button>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {hosts.map((host, i) => (
              <div key={i} className="flex flex-col gap-3 p-4 bg-surface border border-surface-border rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full ${AVATAR_COLOURS[i % AVATAR_COLOURS.length]} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                    {host.name.slice(0, 1).toUpperCase()}
                  </div>
                  <input
                    value={host.name}
                    onChange={(e) => setHosts(h => h.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    className="flex-1 bg-transparent text-sm font-semibold text-ink focus:outline-none border-b border-transparent focus:border-accent transition-colors"
                    placeholder="Host name"
                  />
                  {hosts.length > 2 && (
                    <button onClick={() => setHosts(h => h.filter((_, j) => j !== i))} className="text-ink-dim hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Personality */}
                <div className="relative">
                  <select
                    value={host.personality}
                    onChange={(e) => setHosts(h => h.map((x, j) => j === i ? { ...x, personality: e.target.value } : x))}
                    className="w-full appearance-none bg-surface border border-surface-border text-xs text-ink-muted rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {PERSONALITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
                </div>

                {/* Voice */}
                <div className="relative">
                  <select
                    value={host.voice}
                    onChange={(e) => setHosts(h => h.map((x, j) => j === i ? { ...x, voice: e.target.value } : x))}
                    className="w-full appearance-none bg-surface border border-surface-border text-xs text-ink-muted rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {VOICES.map(v => <option key={v.id} value={v.id}>{v.name} · {v.region}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-4 py-2">{error}</p>}

        <button
          onClick={generate}
          disabled={!slideContent.trim()}
          className="w-full py-4 bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-base rounded-2xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg"
        >
          <Mic2 className="w-5 h-5" /> Generate Podcast
        </button>
      </main>
    </div>
  );

  // ── GENERATING ────────────────────────────────────────────────────────────
  if (step === 'generating') return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-3">
        {hosts.map((h, i) => (
          <div key={i} className={`w-10 h-10 rounded-full ${AVATAR_COLOURS[i % AVATAR_COLOURS.length]} flex items-center justify-center text-white font-bold`}>
            {h.name.slice(0, 1).toUpperCase()}
          </div>
        ))}
      </div>
      <Loader2 className="w-8 h-8 text-accent-light animate-spin" />
      <p className="text-ink-muted text-sm">Writing the conversation…</p>
      <p className="text-xs text-ink-dim">This takes about 15 seconds</p>
    </div>
  );

  // ── PLAYER ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      <audio ref={audioRef} />

      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-surface-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <button onClick={() => { audioRef.current?.pause(); setStep('setup'); }} className="text-ink-muted hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-1.5 mr-auto">
            <Mic2 className="w-4 h-4 text-accent-light" />
            <span className="font-medium text-sm truncate max-w-[180px]">{deckName || 'Podcast'}</span>
          </div>
          <button
            onClick={() => { audioRef.current?.pause(); setLines([]); audioCacheRef.current.clear(); setStep('setup'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent text-sm rounded-lg font-medium transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Regenerate</span>
          </button>
          <button
            onClick={downloadTranscript}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent text-sm rounded-lg font-medium transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Transcript</span>
          </button>
          <button
            onClick={downloadAudio}
            disabled={isDownloading}
            title={isDownloading ? `Rendering… ${downloadProgress.current}/${downloadProgress.total}` : 'Download episode as MP3'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/90 disabled:opacity-60 text-white text-sm rounded-lg font-medium transition-all"
          >
            {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">
              {isDownloading ? `${downloadProgress.current}/${downloadProgress.total}` : 'MP3'}
            </span>
          </button>

          <div className="relative">
            <button
              onClick={handleShare}
              disabled={isSharing}
              title="Share this podcast"
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

          {shareId && (
            <a
              href={`/api/rss/${shareId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent text-sm rounded-lg font-medium transition-all text-ink-muted"
            >
              <Rss className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">RSS</span>
            </a>
          )}
        </div>
      </header>

      {/* Conversation */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 pb-32 flex flex-col gap-3">
        {lines.map((line, i) => {
          const isActive = i === currentIdx;
          const colour = hostColour(line.speaker);
          const isLeft = hosts.findIndex(h => h.name === line.speaker) % 2 === 0;

          return (
            <div
              key={i}
              ref={(el) => { lineRefs.current[i] = el; }}
              onClick={() => playFrom(i)}
              className={`flex gap-3 cursor-pointer ${isLeft ? '' : 'flex-row-reverse'}`}
            >
              <div className={`w-8 h-8 rounded-full ${colour} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-1`}>
                {line.speaker.slice(0, 1).toUpperCase()}
              </div>
              <div className={`max-w-[80%] flex flex-col gap-1 ${isLeft ? '' : 'items-end'}`}>
                <span className="text-xs text-ink-dim font-medium px-1">{line.speaker}</span>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed transition-all ${
                  isLeft ? 'rounded-tl-sm' : 'rounded-tr-sm'
                } ${
                  isActive
                    ? 'bg-accent text-white shadow-lg'
                    : 'bg-surface-card border border-surface-border text-ink hover:border-accent/50'
                }`}>
                  {line.text}
                </div>
              </div>
            </div>
          );
        })}

        {chapters.length > 0 && (
          <details className="mt-4 mb-4">
            <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink list-none flex items-center gap-1.5 px-2 py-1">
              <span className="text-ink-dim">▸</span> {chapters.length} chapters
            </summary>
            <div className="mt-2 flex flex-col gap-1">
              {chapters.map((ch, i) => (
                <button key={i} onClick={() => playFrom(i)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-hover text-left transition-colors w-full">
                  <span className="text-xs font-mono text-accent-light w-10 flex-shrink-0">{ch.timestamp}</span>
                  <span className="text-xs font-semibold text-ink-muted w-16 flex-shrink-0 truncate">{ch.speaker}</span>
                  <span className="text-xs text-ink-dim truncate">{ch.preview}</span>
                </button>
              ))}
            </div>
          </details>
        )}
      </main>

      {/* Playback bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-surface-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <span className="text-xs text-ink-muted w-20 hidden sm:block">
            {currentIdx + 1} / {lines.length}
          </span>

          <div className="flex items-center gap-3 mx-auto">
            <button
              onClick={() => playFrom(Math.max(currentIdx - 1, 0))}
              className="w-10 h-10 rounded-full bg-surface-card border border-surface-border hover:border-accent flex items-center justify-center transition-all"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              disabled={isLoading}
              className="w-14 h-14 rounded-full bg-accent hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center transition-all shadow-lg"
            >
              {isLoading ? <Loader2 className="w-6 h-6 text-white animate-spin" />
                : isPlaying ? <Pause className="w-6 h-6 text-white" />
                : <Play className="w-6 h-6 text-white ml-0.5" />}
            </button>

            <button
              onClick={() => playFrom(currentIdx + 1)}
              className="w-10 h-10 rounded-full bg-surface-card border border-surface-border hover:border-accent flex items-center justify-center transition-all"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          <div className="w-20 hidden sm:flex items-center">
            <div className="relative">
              <select
                value={speed}
                onChange={(e) => { setSpeed(parseFloat(e.target.value)); audioCacheRef.current.clear(); }}
                className="appearance-none bg-surface-card border border-surface-border text-xs text-ink rounded-lg pl-2 pr-5 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
              >
                {[0.75, 0.9, 1.0, 1.1, 1.25].map(s => <option key={s} value={s}>{s}×</option>)}
              </select>
              <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
