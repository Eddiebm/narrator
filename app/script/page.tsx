'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Upload, ClipboardPaste, Play, Pause, SkipBack, SkipForward,
  Loader2, Users, Tv, BookOpen, ChevronDown, Mic, RefreshCw, Download, Video, Music2,
} from 'lucide-react';
import { applyDict, loadDict } from '@/lib/pronunciation';

// ─── Voice pool ────────────────────────────────────────────────────────────
const VOICE_POOL = [
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

const DEFAULT_NARRATOR = 'en-GB-SoniaNeural';

// ─── Types ──────────────────────────────────────────────────────────────────
type Mode = 'multi' | 'teleprompter' | 'reader';

interface ScriptLine {
  type: 'character' | 'dialogue' | 'direction' | 'plain';
  character?: string;
  text: string;
}

// ─── Script parser ──────────────────────────────────────────────────────────
function parseScript(raw: string): ScriptLine[] {
  const lines = raw.split(/\r?\n/);
  const result: ScriptLine[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }
    if (/^\(.*\)$/.test(line)) { result.push({ type: 'direction', text: line }); i++; continue; }
    if (/^[A-Z][A-Z0-9 \-'\.]{0,39}$/.test(line) && line.length > 1) {
      const character = line;
      const dialogueLines: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next) { i++; break; }
        if (/^[A-Z][A-Z0-9 \-'\.]{0,39}$/.test(next) && next.length > 1) break;
        dialogueLines.push(next);
        i++;
      }
      if (dialogueLines.length > 0) {
        result.push({ type: 'character', character, text: character });
        result.push({ type: 'dialogue', character, text: dialogueLines.join(' ') });
      }
      continue;
    }
    result.push({ type: 'plain', text: line });
    i++;
  }
  return result;
}

function extractCharacters(lines: ScriptLine[]): string[] {
  const seen = new Set<string>();
  return lines
    .filter(l => l.type === 'dialogue' && l.character)
    .map(l => l.character!)
    .filter(c => { if (seen.has(c)) return false; seen.add(c); return true; });
}

function isScriptLike(lines: ScriptLine[]): boolean {
  return lines.filter(l => l.type === 'character').length >= 2;
}

// ─── Script video canvas helpers ────────────────────────────────────────────
const W = 1280, H = 720;

function wrapCentered(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lh: number): number {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, cy);
      line = word;
      cy += lh;
    } else line = test;
  }
  if (line) { ctx.fillText(line, cx, cy); cy += lh; }
  return cy;
}

function drawScriptFrame(ctx: CanvasRenderingContext2D, line: ScriptLine, lineNum: number, total: number) {
  ctx.fillStyle = '#0d0f14';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(0, 0, W, 6);

  ctx.textAlign = 'right';
  ctx.font = '500 18px system-ui, sans-serif';
  ctx.fillStyle = '#6b7280';
  ctx.fillText(`${lineNum} / ${total}`, W - 48, 50);

  ctx.textAlign = 'center';
  if (line.character) {
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillStyle = '#a78bfa';
    ctx.fillText(line.character, W / 2, 220);
  }

  const isDirection = line.type === 'direction';
  ctx.font = isDirection ? 'italic 30px system-ui, sans-serif' : '400 36px system-ui, sans-serif';
  ctx.fillStyle = isDirection ? '#71717a' : '#e4e4f0';
  wrapCentered(ctx, line.text, W / 2, line.character ? 290 : 260, 1100, 52);
}

function getSupportedMime() {
  if (typeof MediaRecorder === 'undefined') throw new Error('MediaRecorder not supported');
  for (const t of ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'])
    if (MediaRecorder.isTypeSupported(t)) return t;
  return 'video/webm';
}

// ─── Component ──────────────────────────────────────────────────────────────
export default function ScriptPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  const blobCacheRef = useRef<Map<string, Blob>>(new Map());
  const audioUrlsRef = useRef<string[]>([]);
  const teleprompterRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [mode, setMode] = useState<Mode>('multi');
  const [rawText, setRawText] = useState('');
  const [lines, setLines] = useState<ScriptLine[]>([]);
  const [characters, setCharacters] = useState<string[]>([]);
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>({});
  const [narratorVoice, setNarratorVoice] = useState(DEFAULT_NARRATOR);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1.0);
  const [wpm, setWpm] = useState(160);
  const [isScrolling, setIsScrolling] = useState(false);
  const [fileName, setFileName] = useState('');
  const [isDownloadingMp3, setIsDownloadingMp3] = useState(false);
  const [isDownloadingMp4, setIsDownloadingMp4] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });

  const currentLineIdxRef = useRef(0);
  const isPlayingRef = useRef(false);
  useEffect(() => { currentLineIdxRef.current = currentLineIdx; }, [currentLineIdx]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    return () => {
      audioUrlsRef.current.forEach(URL.revokeObjectURL);
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
  }, []);

  const assignVoices = useCallback((chars: string[]) => {
    const map: Record<string, string> = {};
    chars.forEach((char, i) => { map[char] = VOICE_POOL[i % VOICE_POOL.length].id; });
    return map;
  }, []);

  const loadContent = useCallback((text: string, name: string) => {
    const parsed = parseScript(text);
    const chars = extractCharacters(parsed);
    setLines(parsed);
    setCharacters(chars);
    setVoiceMap(assignVoices(chars));
    setMode(isScriptLike(parsed) ? 'multi' : 'reader');
    setCurrentLineIdx(0);
    currentLineIdxRef.current = 0;
    setIsPlaying(false);
    setIsScrolling(false);
    setRawText(text);
    setFileName(name);
    setError(null);
    audioCacheRef.current.clear();
    blobCacheRef.current.clear();
    audioUrlsRef.current.forEach(URL.revokeObjectURL);
    audioUrlsRef.current = [];
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.onended = null; audioRef.current.src = ''; }
    if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
  }, [assignVoices]);

  const handleFile = useCallback(async (file: File) => {
    setIsExtracting(true); setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      if (file.name.endsWith('.pptx')) {
        const res = await fetch('/api/parse', { method: 'POST', body: formData });
        if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || `Parse failed (${res.status})`); return; }
        const data = await res.json();
        const text = data.slides.map((s: { title: string; body: string[] }) => [s.title, ...s.body].join('\n')).join('\n\n');
        loadContent(text, data.name ?? file.name);
      } else {
        const res = await fetch('/api/extract-doc', { method: 'POST', body: formData });
        if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || `Extract failed (${res.status})`); return; }
        const data = await res.json();
        loadContent(data.paragraphs?.join('\n\n') ?? '', file.name);
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to read the file.'); }
    finally { setIsExtracting(false); }
  }, [loadContent]);

  const handlePaste = useCallback(() => {
    if (!pasteText.trim()) return;
    loadContent(pasteText.trim(), 'Pasted script');
    setPasteText(''); setShowPaste(false);
  }, [pasteText, loadContent]);

  // ── Resolve voice for a line ─────────────────────────────────────────────
  const resolveVoice = useCallback((line: ScriptLine): string => {
    if (line.type === 'dialogue' && line.character) return voiceMap[line.character] ?? narratorVoice;
    return narratorVoice;
  }, [voiceMap, narratorVoice]);

  // ── All speakable lines ──────────────────────────────────────────────────
  const speakableLines = useCallback(() =>
    lines.map((line, i) => ({ line, i })).filter(({ line }) => line.type !== 'character'),
  [lines]);

  // ── Render all audio blobs, return sorted list ───────────────────────────
  const renderAllBlobs = useCallback(async (onProgress: (c: number, t: number) => void): Promise<{ line: ScriptLine; blob: Blob }[]> => {
    const items = speakableLines();
    const result: { line: ScriptLine; blob: Blob }[] = [];
    for (let j = 0; j < items.length; j++) {
      const { line, i } = items[j];
      const cacheKey = `${i}-${line.text}-${resolveVoice(line)}`;
      let blob = blobCacheRef.current.get(cacheKey);
      if (!blob) {
        const res = await fetch('/api/reader-tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: applyDict(line.text, loadDict()), voice: resolveVoice(line), speed }),
        });
        if (res.ok) { blob = await res.blob(); blobCacheRef.current.set(cacheKey, blob); }
      }
      if (blob) result.push({ line, blob });
      onProgress(j + 1, items.length);
    }
    return result;
  }, [speakableLines, resolveVoice, speed]);

  // ── MP3 download ─────────────────────────────────────────────────────────
  const downloadMp3 = useCallback(async () => {
    if (!lines.length || isDownloadingMp3 || isDownloadingMp4) return;
    setIsDownloadingMp3(true);
    setExportProgress({ current: 0, total: speakableLines().length });
    try {
      const rendered = await renderAllBlobs((c, t) => setExportProgress({ current: c, total: t }));
      if (!rendered.length) return;
      const combined = new Blob(rendered.map(r => r.blob), { type: 'audio/mpeg' });
      const url = URL.createObjectURL(combined);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(fileName.replace(/\.[^.]+$/, '') || 'script')}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setIsDownloadingMp3(false); setExportProgress({ current: 0, total: 0 }); }
  }, [lines, fileName, isDownloadingMp3, isDownloadingMp4, speakableLines, renderAllBlobs]);

  // ── MP4 download ─────────────────────────────────────────────────────────
  const downloadMp4 = useCallback(async () => {
    if (!lines.length || isDownloadingMp3 || isDownloadingMp4) return;
    setIsDownloadingMp4(true);
    setExportProgress({ current: 0, total: speakableLines().length });
    try {
      const rendered = await renderAllBlobs((c, t) => setExportProgress({ current: c, total: t }));
      if (!rendered.length) return;

      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d')!;
      const total = rendered.length;

      const videoStream = canvas.captureStream(25);
      const audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const audioDest = audioCtx.createMediaStreamDestination();
      const audioTrack = audioDest.stream.getAudioTracks()[0];
      const tracks: MediaStreamTrack[] = [videoStream.getVideoTracks()[0]];
      if (audioTrack) tracks.push(audioTrack);

      const mimeType = getSupportedMime();
      const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      recorder.start(100);

      for (let i = 0; i < rendered.length; i++) {
        const { line, blob } = rendered[i];
        setExportProgress({ current: i + 1, total });
        drawScriptFrame(ctx, line, i + 1, total);
        try {
          const buf = await audioCtx.decodeAudioData(await blob.arrayBuffer());
          await new Promise<void>((resolve) => {
            const src = audioCtx.createBufferSource();
            src.buffer = buf; src.connect(audioDest);
            src.onended = () => resolve(); src.start();
          });
        } catch {
          await new Promise<void>((r) => setTimeout(r, Math.max(2000, blob.size / 16)));
        }
      }

      await new Promise<void>((r) => { recorder.onstop = () => r(); recorder.stop(); });
      await audioCtx.close();

      const ext = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(fileName.replace(/\.[^.]+$/, '') || 'script')}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setIsDownloadingMp4(false); setExportProgress({ current: 0, total: 0 }); }
  }, [lines, fileName, isDownloadingMp3, isDownloadingMp4, speakableLines, renderAllBlobs]);

  // ── TTS for playback ─────────────────────────────────────────────────────
  const fetchLineAudio = useCallback(async (idx: number): Promise<string | null> => {
    const line = lines[idx];
    if (!line || line.type === 'character') return null;
    const voice = resolveVoice(line);
    const cacheKey = `${idx}-${line.text}-${voice}`;
    if (audioCacheRef.current.has(cacheKey)) return audioCacheRef.current.get(cacheKey)!;
    try {
      const processedText = applyDict(line.text, loadDict());
      const res = await fetch('/api/reader-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: processedText, voice, speed }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      blobCacheRef.current.set(cacheKey, blob);
      const url = URL.createObjectURL(blob);
      audioUrlsRef.current.push(url);
      audioCacheRef.current.set(cacheKey, url);
      return url;
    } catch { return null; }
  }, [lines, resolveVoice, speed]);

  const playLineFrom = useCallback(async (idx: number) => {
    let start = idx;
    while (start < lines.length && lines[start]?.type === 'character') start++;
    if (start >= lines.length) { setIsPlaying(false); return; }
    setCurrentLineIdx(start); currentLineIdxRef.current = start;
    setIsLoading(true);
    const url = await fetchLineAudio(start);
    setIsLoading(false);
    const audio = audioRef.current;
    if (!audio) return;
    if (!url) { playLineFrom(start + 1); return; }
    audio.pause(); audio.onended = null; audio.src = url;
    audio.onended = () => playLineFrom(start + 1);
    try {
      await audio.play();
      setIsPlaying(true);
      // Prefetch the next 3 speakable lines so there's no silence gap on onended
      let next = start + 1;
      let prefetched = 0;
      while (next < lines.length && prefetched < 3) {
        while (next < lines.length && lines[next]?.type === 'character') next++;
        if (next < lines.length) { fetchLineAudio(next); prefetched++; next++; }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError('Playback blocked. Tap play to start.'); setIsPlaying(false);
      }
    }
  }, [lines, fetchLineAudio]);

  const togglePlay = useCallback(() => {
    if (!lines.length) return;
    if (isPlaying) { audioRef.current?.pause(); setIsPlaying(false); }
    else {
      const audio = audioRef.current;
      if (audio?.src && audio.paused && audio.readyState >= 2)
        audio.play().then(() => setIsPlaying(true)).catch(() => playLineFrom(currentLineIdx));
      else playLineFrom(currentLineIdx);
    }
  }, [isPlaying, lines, currentLineIdx, playLineFrom]);

  // ── Teleprompter ─────────────────────────────────────────────────────────
  const startScroll = useCallback(() => {
    if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    const pixelsPerMs = (wpm * 20) / 60000;
    scrollIntervalRef.current = setInterval(() => {
      teleprompterRef.current?.scrollBy({ top: pixelsPerMs * 50, behavior: 'auto' });
    }, 50);
    setIsScrolling(true);
  }, [wpm]);

  const stopScroll = useCallback(() => {
    if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    setIsScrolling(false);
  }, []);

  const toggleScroll = useCallback(() => {
    if (isScrolling) stopScroll(); else startScroll();
  }, [isScrolling, startScroll, stopScroll]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') { e.preventDefault(); if (mode === 'teleprompter') toggleScroll(); else togglePlay(); }
      if (mode === 'multi' || mode === 'reader') {
        if (e.code === 'ArrowRight') { e.preventDefault(); playLineFrom(currentLineIdxRef.current + 1); }
        if (e.code === 'ArrowLeft') { e.preventDefault(); playLineFrom(Math.max(currentLineIdxRef.current - 1, 0)); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, togglePlay, toggleScroll, playLineFrom]);

  // Background pre-gen
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (lines.length > 0) {
      let count = 0;
      for (let i = 0; i < lines.length && count < 3; i++) {
        if (lines[i].type !== 'character') { fetchLineAudio(i); count++; }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.length]);

  const hasContent = lines.length > 0;
  const isExporting = isDownloadingMp3 || isDownloadingMp4;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      <audio ref={audioRef} />

      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-surface-border">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3 overflow-x-auto scrollbar-none">
          <button onClick={() => router.push('/')} className="text-ink-muted hover:text-ink transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 mr-auto flex-shrink-0">
            <Mic className="w-4 h-4 text-accent-light" />
            <span className="font-medium text-sm truncate max-w-[140px]">{fileName || 'Script Reader'}</span>
          </div>

          {/* Mode tabs */}
          {hasContent && (
            <div className="flex items-center gap-1 bg-surface-card border border-surface-border rounded-lg p-1 flex-shrink-0">
              {([
                { id: 'multi', icon: Users, label: 'Characters' },
                { id: 'teleprompter', icon: Tv, label: 'Teleprompter' },
                { id: 'reader', icon: BookOpen, label: 'Reader' },
              ] as const).map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                    mode === id ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          )}

          {/* Narrator voice picker */}
          {hasContent && (
            <div className="relative flex-shrink-0">
              <select
                value={narratorVoice}
                onChange={(e) => { setNarratorVoice(e.target.value); audioCacheRef.current.clear(); blobCacheRef.current.clear(); }}
                title="Narrator / reader voice"
                className="appearance-none bg-surface-card border border-surface-border text-xs text-ink rounded-lg pl-2 pr-6 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
              >
                {VOICE_POOL.map(v => (
                  <option key={v.id} value={v.id}>{v.name} · {v.region}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
            </div>
          )}

          <button onClick={() => { loadContent('', ''); setShowPaste(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent text-sm rounded-lg font-medium transition-all flex-shrink-0">
            <ClipboardPaste className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Paste</span>
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent text-sm rounded-lg font-medium transition-all flex-shrink-0">
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{hasContent ? 'New file' : 'Upload'}</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".pptx,.pdf,.docx,.txt,.fdx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

          {/* Download buttons */}
          {hasContent && mode !== 'teleprompter' && (
            <>
              <button
                onClick={downloadMp3}
                disabled={isExporting}
                title={isDownloadingMp3 ? `Rendering audio… ${exportProgress.current}/${exportProgress.total}` : 'Download full reading as MP3'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent disabled:opacity-50 text-sm rounded-lg font-medium transition-all flex-shrink-0"
              >
                {isDownloadingMp3 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Music2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">
                  {isDownloadingMp3 ? `${exportProgress.current}/${exportProgress.total}` : 'MP3'}
                </span>
              </button>
              <button
                onClick={downloadMp4}
                disabled={isExporting}
                title={isDownloadingMp4 ? `Rendering video… ${exportProgress.current}/${exportProgress.total}` : 'Download full reading as MP4 video'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-all flex-shrink-0"
              >
                {isDownloadingMp4 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">
                  {isDownloadingMp4 ? `${exportProgress.current}/${exportProgress.total}` : 'MP4'}
                </span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Empty state */}
      {!hasContent && !isExtracting && !showPaste && (
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12 flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <div onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-surface-border rounded-2xl p-14 flex flex-col items-center gap-4 cursor-pointer hover:border-accent/50 hover:bg-surface-hover transition-all">
              <div className="w-14 h-14 rounded-xl bg-surface-card border border-surface-border flex items-center justify-center">
                <Upload className="w-7 h-7 text-ink-muted" />
              </div>
              <div className="text-center">
                <p className="font-medium text-ink mb-1">Upload a script</p>
                <p className="text-sm text-ink-muted">PPTX, PDF, DOCX, TXT, or Final Draft (.fdx)</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-surface-border" />
              <span className="text-xs text-ink-dim">or</span>
              <div className="flex-1 h-px bg-surface-border" />
            </div>
            <button onClick={() => setShowPaste(true)}
              className="w-full border-2 border-dashed border-surface-border rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-accent/50 hover:bg-surface-hover transition-all">
              <div className="w-14 h-14 rounded-xl bg-surface-card border border-surface-border flex items-center justify-center">
                <ClipboardPaste className="w-7 h-7 text-ink-muted" />
              </div>
              <div className="text-center">
                <p className="font-medium text-ink mb-1">Paste a script</p>
                <p className="text-sm text-ink-muted">Any format — screenplay, stage play, interview, speech</p>
              </div>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { icon: Users, label: 'Characters', desc: 'Different voice per character — auto-detected' },
              { icon: Tv, label: 'Teleprompter', desc: 'Auto-scrolling text at your reading pace' },
              { icon: BookOpen, label: 'Reader', desc: 'Read aloud paragraph by paragraph' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="bg-surface-card border border-surface-border rounded-xl p-4 text-center">
                <Icon className="w-5 h-5 text-accent-light mx-auto mb-2" />
                <p className="text-sm font-medium text-ink mb-1">{label}</p>
                <p className="text-xs text-ink-muted">{desc}</p>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* Paste form */}
      {showPaste && (
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 flex flex-col gap-4">
          <textarea autoFocus value={pasteText} onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your script here — screenplay, play, interview, speech, anything…"
            rows={18}
            className="w-full bg-surface-card border border-surface-border rounded-2xl px-5 py-4 text-base text-ink leading-relaxed focus:outline-none focus:border-accent resize-none placeholder-ink-dim font-mono" />
          <div className="flex gap-3">
            <button onClick={() => setShowPaste(false)} className="px-4 py-2 text-sm text-ink-muted border border-surface-border rounded-lg hover:border-accent transition-all">Cancel</button>
            <button onClick={handlePaste} disabled={!pasteText.trim()}
              className="flex-1 px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-all flex items-center justify-center gap-2">
              <Mic className="w-4 h-4" /> Load Script
            </button>
          </div>
        </main>
      )}

      {isExtracting && (
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-accent-light animate-spin" />
            <p className="text-ink-muted text-sm">Reading script…</p>
          </div>
        </main>
      )}

      {error && (
        <div className="max-w-4xl mx-auto w-full px-4 pt-4">
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-4 py-2">{error}</p>
        </div>
      )}

      {/* Export progress banner */}
      {isExporting && (
        <div className="bg-accent/10 border-b border-accent/30 px-4 py-2 text-sm text-accent-light flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
          <span>
            {isDownloadingMp4 ? `Rendering video… line ${exportProgress.current} of ${exportProgress.total}` : `Rendering audio… ${exportProgress.current} / ${exportProgress.total}`}
          </span>
          <span className="ml-auto text-xs text-accent-light/70">Keep this tab open</span>
        </div>
      )}

      {/* ── MULTI-CHARACTER MODE ── */}
      {hasContent && mode === 'multi' && (
        <>
          {characters.length > 0 && (
            <div className="max-w-4xl mx-auto w-full px-4 pt-4">
              <div className="bg-surface-card border border-surface-border rounded-xl p-4">
                <p className="text-xs text-ink-muted font-medium uppercase tracking-wider mb-3">Character Voices</p>
                <div className="flex flex-wrap gap-3">
                  {characters.map((char) => (
                    <div key={char} className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-accent-light">{char}</span>
                      <div className="relative">
                        <select
                          value={voiceMap[char] ?? narratorVoice}
                          onChange={(e) => { setVoiceMap(v => ({ ...v, [char]: e.target.value })); audioCacheRef.current.clear(); blobCacheRef.current.clear(); }}
                          className="appearance-none bg-surface border border-surface-border text-xs text-ink rounded-lg pl-2 pr-5 py-1 focus:outline-none focus:border-accent cursor-pointer"
                        >
                          {VOICE_POOL.map(v => <option key={v.id} value={v.id}>{v.name} · {v.region}</option>)}
                        </select>
                        <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 pb-28 flex flex-col gap-1">
            {lines.map((line, i) => {
              if (line.type === 'character') return <p key={i} className="text-xs font-mono font-bold text-accent-light mt-4 ml-32">{line.text}</p>;
              if (line.type === 'direction') return <p key={i} className="text-sm text-ink-dim italic px-4 my-1">{line.text}</p>;
              const isActive = i === currentLineIdx;
              return (
                <p key={i} onClick={() => playLineFrom(i)}
                  className={`text-base leading-relaxed rounded-lg px-4 py-2 cursor-pointer transition-all ${line.type === 'dialogue' ? 'ml-32' : ''} ${isActive ? 'bg-accent/15 border border-accent/40 text-ink' : 'text-ink-muted hover:text-ink hover:bg-surface-hover'}`}>
                  {line.text}
                </p>
              );
            })}
          </main>
        </>
      )}

      {/* ── TELEPROMPTER MODE ── */}
      {hasContent && mode === 'teleprompter' && (
        <main ref={teleprompterRef} className="flex-1 overflow-y-auto px-8 py-16 pb-32" style={{ scrollBehavior: 'auto' }}>
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-10 justify-center">
              <span className="text-xs text-ink-muted">Scroll speed</span>
              <input type="range" min={60} max={400} step={10} value={wpm}
                onChange={(e) => { setWpm(Number(e.target.value)); if (isScrolling) { stopScroll(); startScroll(); } }}
                className="w-32 accent-accent" />
              <span className="text-xs text-ink-muted w-16">{wpm} WPM</span>
            </div>
            <div className="text-2xl leading-loose text-ink space-y-6">
              {lines.map((line, i) => {
                if (line.type === 'character') return <p key={i} className="text-sm font-mono font-bold text-accent-light">{line.text}</p>;
                if (line.type === 'direction') return <p key={i} className="text-lg text-ink-dim italic">{line.text}</p>;
                return <p key={i}>{line.text}</p>;
              })}
            </div>
          </div>
        </main>
      )}

      {/* ── READER MODE ── */}
      {hasContent && mode === 'reader' && (
        <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 pb-28 flex flex-col gap-3">
          {lines.map((line, i) => {
            if (line.type === 'character') return <p key={i} className="text-xs font-mono font-bold text-accent-light mt-3">{line.text}</p>;
            if (line.type === 'direction') return <p key={i} className="text-sm text-ink-dim italic px-3">{line.text}</p>;
            const isActive = i === currentLineIdx;
            return (
              <p key={i} onClick={() => playLineFrom(i)}
                className={`text-lg leading-relaxed rounded-xl px-5 py-4 cursor-pointer transition-all ${isActive ? 'bg-accent/15 border border-accent/40 text-ink' : 'text-ink-muted hover:text-ink hover:bg-surface-hover'}`}>
                {line.text}
              </p>
            );
          })}
        </main>
      )}

      {/* ── PLAYBACK BAR ── */}
      {hasContent && mode !== 'teleprompter' && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-surface-border">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
            <span className="text-xs text-ink-muted w-24 hidden sm:block">
              {currentLineIdx + 1} / {lines.filter(l => l.type !== 'character').length} lines
            </span>
            <div className="flex items-center gap-3 mx-auto">
              <button onClick={() => playLineFrom(Math.max(currentLineIdx - 1, 0))}
                className="w-10 h-10 rounded-full bg-surface-card border border-surface-border hover:border-accent flex items-center justify-center transition-all">
                <SkipBack className="w-4 h-4" />
              </button>
              <button onClick={togglePlay} disabled={isLoading}
                className="w-14 h-14 rounded-full bg-accent hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center transition-all shadow-lg">
                {isLoading ? <Loader2 className="w-6 h-6 text-white animate-spin" />
                  : isPlaying ? <Pause className="w-6 h-6 text-white" />
                  : <Play className="w-6 h-6 text-white ml-0.5" />}
              </button>
              <button onClick={() => playLineFrom(currentLineIdx + 1)}
                className="w-10 h-10 rounded-full bg-surface-card border border-surface-border hover:border-accent flex items-center justify-center transition-all">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
            <div className="w-24 hidden sm:flex items-center gap-1">
              <div className="relative">
                <select value={speed} onChange={(e) => { setSpeed(parseFloat(e.target.value)); audioCacheRef.current.clear(); blobCacheRef.current.clear(); }}
                  className="appearance-none bg-surface-card border border-surface-border text-xs text-ink rounded-lg pl-2 pr-5 py-1.5 focus:outline-none focus:border-accent cursor-pointer">
                  {[0.75, 0.9, 1.0, 1.1, 1.25].map(s => <option key={s} value={s}>{s}×</option>)}
                </select>
                <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TELEPROMPTER BAR ── */}
      {hasContent && mode === 'teleprompter' && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-surface-border">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-center gap-4">
            <button onClick={() => teleprompterRef.current?.scrollTo({ top: 0 })}
              className="flex items-center gap-1.5 px-3 py-2 bg-surface-card border border-surface-border hover:border-accent text-sm rounded-lg font-medium transition-all">
              <RefreshCw className="w-3.5 h-3.5" /> Reset
            </button>
            <button onClick={toggleScroll}
              className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all shadow-lg ${isScrolling ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-accent hover:bg-accent/90 text-white'}`}>
              {isScrolling ? <><Pause className="w-4 h-4" /> Stop</> : <><Play className="w-4 h-4 ml-0.5" /> Start Scrolling</>}
            </button>
            <span className="text-xs text-ink-muted">Space to toggle</span>
          </div>
        </div>
      )}
    </div>
  );
}
