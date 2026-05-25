'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Upload, ClipboardPaste, Play, Pause, SkipBack, SkipForward,
  Loader2, Users, Tv, BookOpen, ChevronDown, Mic, RefreshCw, Download,
} from 'lucide-react';

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

const NARRATOR_VOICE = 'en-GB-SoniaNeural';

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

    // Stage direction in parens
    if (/^\(.*\)$/.test(line)) {
      result.push({ type: 'direction', text: line });
      i++;
      continue;
    }

    // Character cue: ALL CAPS, no punctuation except . - '
    if (/^[A-Z][A-Z0-9 \-'\.]{0,39}$/.test(line) && line.length > 1) {
      const character = line;
      // Collect dialogue lines after
      const dialogueLines: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next) { i++; break; }
        // Another ALL CAPS cue means new character
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

    // Plain text / narration
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
  const charLines = lines.filter(l => l.type === 'character').length;
  return charLines >= 2;
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
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [currentLineIdx, setCurrentLineIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1.0);
  const [wpm, setWpm] = useState(160); // teleprompter words per minute
  const [isScrolling, setIsScrolling] = useState(false);
  const [fileName, setFileName] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });

  const currentLineIdxRef = useRef(0);
  const isPlayingRef = useRef(false);

  useEffect(() => { currentLineIdxRef.current = currentLineIdx; }, [currentLineIdx]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // Cleanup
  useEffect(() => {
    return () => {
      audioUrlsRef.current.forEach(URL.revokeObjectURL);
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
  }, []);

  // Auto-assign voices to characters
  const assignVoices = useCallback((chars: string[]) => {
    const map: Record<string, string> = {};
    chars.forEach((char, i) => {
      map[char] = VOICE_POOL[i % VOICE_POOL.length].id;
    });
    return map;
  }, []);

  const loadContent = useCallback((text: string, name: string) => {
    const parsed = parseScript(text);
    const chars = extractCharacters(parsed);
    const detectedMode = isScriptLike(parsed) ? 'multi' : 'reader';
    setLines(parsed);
    setCharacters(chars);
    setVoiceMap(assignVoices(chars));
    setMode(detectedMode);
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
    setIsExtracting(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      if (file.name.endsWith('.pptx')) {
        // PPTX: use the presentation parser
        const res = await fetch('/api/parse', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Failed to parse PPTX.'); return; }
        const text = data.slides
          .map((s: { title: string; body: string[] }) => [s.title, ...s.body].join('\n'))
          .join('\n\n');
        loadContent(text, data.name ?? file.name);
      } else {
        // PDF / DOCX / TXT
        const res = await fetch('/api/extract-doc', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) { setError(data.error || 'Failed to extract text.'); return; }
        loadContent(data.paragraphs?.join('\n\n') ?? '', file.name);
      }
    } catch {
      setError('Failed to read the file.');
    } finally {
      setIsExtracting(false);
    }
  }, [loadContent]);

  const handlePaste = useCallback(() => {
    if (!pasteText.trim()) return;
    loadContent(pasteText.trim(), 'Pasted script');
    setPasteText('');
    setShowPaste(false);
  }, [pasteText, loadContent]);

  // ── Download full audio ─────────────────────────────────────────────────
  const downloadAudio = useCallback(async () => {
    if (!lines.length || isDownloading) return;
    const speakable = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => line.type !== 'character');
    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: speakable.length });
    try {
      const blobs: Blob[] = [];
      for (let j = 0; j < speakable.length; j++) {
        const { line, i } = speakable[j];
        const cacheKey = `${i}-${line.text}`;
        let blob = blobCacheRef.current.get(cacheKey);
        if (!blob) {
          let voice = NARRATOR_VOICE;
          if (line.type === 'dialogue' && line.character) voice = voiceMap[line.character] ?? NARRATOR_VOICE;
          const res = await fetch('/api/reader-tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: line.text, voice, speed }),
          });
          if (res.ok) {
            blob = await res.blob();
            blobCacheRef.current.set(cacheKey, blob);
          }
        }
        if (blob) blobs.push(blob);
        setDownloadProgress({ current: j + 1, total: speakable.length });
      }
      if (!blobs.length) return;
      const combined = new Blob(blobs, { type: 'audio/mpeg' });
      const url = URL.createObjectURL(combined);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(fileName.replace(/\.[^.]+$/, '') || 'script')}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
      setDownloadProgress({ current: 0, total: 0 });
    }
  }, [lines, voiceMap, speed, fileName, isDownloading]);

  // ── Multi-character TTS ─────────────────────────────────────────────────
  const fetchLineAudio = useCallback(async (idx: number): Promise<string | null> => {
    const line = lines[idx];
    if (!line || line.type === 'character') return null; // skip character cue lines

    const cacheKey = `${idx}-${line.text}`;
    if (audioCacheRef.current.has(cacheKey)) return audioCacheRef.current.get(cacheKey)!;

    let voice = NARRATOR_VOICE;
    if (line.type === 'dialogue' && line.character) {
      voice = voiceMap[line.character] ?? NARRATOR_VOICE;
    }

    try {
      const res = await fetch('/api/reader-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: line.text, voice, speed }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      blobCacheRef.current.set(cacheKey, blob);
      const url = URL.createObjectURL(blob);
      audioUrlsRef.current.push(url);
      audioCacheRef.current.set(cacheKey, url);
      return url;
    } catch { return null; }
  }, [lines, voiceMap, speed]);

  const playLineFrom = useCallback(async (idx: number) => {
    // Skip character label lines
    let start = idx;
    while (start < lines.length && lines[start]?.type === 'character') start++;
    if (start >= lines.length) { setIsPlaying(false); return; }

    setCurrentLineIdx(start);
    currentLineIdxRef.current = start;
    setIsLoading(true);
    const url = await fetchLineAudio(start);
    setIsLoading(false);

    const audio = audioRef.current;
    if (!audio) return;
    if (!url) {
      // Skip non-speakable lines
      playLineFrom(start + 1);
      return;
    }

    audio.pause();
    audio.onended = null;
    audio.src = url;
    audio.load();
    audio.onended = () => playLineFrom(start + 1);

    try {
      await audio.play();
      setIsPlaying(true);
      // Prefetch next
      let next = start + 1;
      while (next < lines.length && lines[next]?.type === 'character') next++;
      if (next < lines.length) fetchLineAudio(next);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError('Playback blocked. Tap play to start.'); setIsPlaying(false);
      }
    }
  }, [lines, fetchLineAudio]);

  const togglePlay = useCallback(() => {
    if (!lines.length) return;
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      const audio = audioRef.current;
      if (audio?.src && audio.paused && audio.readyState >= 2) {
        audio.play().then(() => setIsPlaying(true)).catch(() => playLineFrom(currentLineIdx));
      } else {
        playLineFrom(currentLineIdx);
      }
    }
  }, [isPlaying, lines, currentLineIdx, playLineFrom]);

  // ── Teleprompter ────────────────────────────────────────────────────────
  const startScroll = useCallback(() => {
    if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    const pixelsPerMin = wpm * 20; // rough px per word * wpm
    const pixelsPerMs = pixelsPerMin / 60000;
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
      if (e.code === 'Space') {
        e.preventDefault();
        if (mode === 'teleprompter') toggleScroll();
        else togglePlay();
      }
      if (mode === 'multi' || mode === 'reader') {
        if (e.code === 'ArrowRight') { e.preventDefault(); playLineFrom(currentLineIdxRef.current + 1); }
        if (e.code === 'ArrowLeft') { e.preventDefault(); playLineFrom(Math.max(currentLineIdxRef.current - 1, 0)); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, togglePlay, toggleScroll, playLineFrom]);

  const hasContent = lines.length > 0;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      <audio ref={audioRef} />

      {/* Header */}
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-surface-border">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => router.push('/')} className="text-ink-muted hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 mr-auto">
            <Mic className="w-4 h-4 text-accent-light" />
            <span className="font-medium text-sm truncate max-w-[180px]">
              {fileName || 'Script Reader'}
            </span>
          </div>

          {/* Mode tabs */}
          {hasContent && (
            <div className="flex items-center gap-1 bg-surface-card border border-surface-border rounded-lg p-1">
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

          <button
            onClick={() => { loadContent('', ''); setShowPaste(true); }}
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
            <span className="hidden sm:inline">{hasContent ? 'New file' : 'Upload'}</span>
          </button>
          <input ref={fileInputRef} type="file" accept=".pptx,.pdf,.docx,.txt,.fdx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />

          {hasContent && mode !== 'teleprompter' && (
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
        </div>
      </header>

      {/* Empty state */}
      {!hasContent && !isExtracting && !showPaste && (
        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-12 flex flex-col gap-4">
          <div className="flex flex-col gap-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-surface-border rounded-2xl p-14 flex flex-col items-center gap-4 cursor-pointer hover:border-accent/50 hover:bg-surface-hover transition-all"
            >
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
            <button
              onClick={() => setShowPaste(true)}
              className="w-full border-2 border-dashed border-surface-border rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-accent/50 hover:bg-surface-hover transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-surface-card border border-surface-border flex items-center justify-center">
                <ClipboardPaste className="w-7 h-7 text-ink-muted" />
              </div>
              <div className="text-center">
                <p className="font-medium text-ink mb-1">Paste a script</p>
                <p className="text-sm text-ink-muted">Any format — screenplay, stage play, interview, speech</p>
              </div>
            </button>
          </div>
          {/* Mode explainers */}
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
          <textarea
            autoFocus
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your script here — screenplay, play, interview, speech, anything…"
            rows={18}
            className="w-full bg-surface-card border border-surface-border rounded-2xl px-5 py-4 text-base text-ink leading-relaxed focus:outline-none focus:border-accent resize-none placeholder-ink-dim font-mono"
          />
          <div className="flex gap-3">
            <button onClick={() => setShowPaste(false)} className="px-4 py-2 text-sm text-ink-muted border border-surface-border rounded-lg hover:border-accent transition-all">
              Cancel
            </button>
            <button
              onClick={handlePaste}
              disabled={!pasteText.trim()}
              className="flex-1 px-4 py-2 bg-accent hover:bg-accent/90 disabled:opacity-40 text-white text-sm rounded-lg font-medium transition-all flex items-center justify-center gap-2"
            >
              <Mic className="w-4 h-4" /> Load Script
            </button>
          </div>
        </main>
      )}

      {/* Extracting */}
      {isExtracting && (
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-accent-light animate-spin" />
            <p className="text-ink-muted text-sm">Reading script…</p>
          </div>
        </main>
      )}

      {/* Error */}
      {error && (
        <div className="max-w-4xl mx-auto w-full px-4 pt-4">
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-4 py-2">{error}</p>
        </div>
      )}

      {/* ── MULTI-CHARACTER MODE ── */}
      {hasContent && mode === 'multi' && (
        <>
          {/* Character voice assignments */}
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
                          value={voiceMap[char] ?? NARRATOR_VOICE}
                          onChange={(e) => setVoiceMap(v => ({ ...v, [char]: e.target.value }))}
                          className="appearance-none bg-surface border border-surface-border text-xs text-ink rounded-lg pl-2 pr-5 py-1 focus:outline-none focus:border-accent cursor-pointer"
                        >
                          {VOICE_POOL.map(v => (
                            <option key={v.id} value={v.id}>{v.name} · {v.region}</option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Script lines */}
          <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-4 pb-28 flex flex-col gap-1">
            {lines.map((line, i) => {
              if (line.type === 'character') return (
                <p key={i} className="text-xs font-mono font-bold text-accent-light mt-4 ml-32">{line.text}</p>
              );
              if (line.type === 'direction') return (
                <p key={i} className="text-sm text-ink-dim italic px-4 my-1">{line.text}</p>
              );
              const isActive = i === currentLineIdx;
              return (
                <p
                  key={i}
                  onClick={() => playLineFrom(i)}
                  className={`text-base leading-relaxed rounded-lg px-4 py-2 cursor-pointer transition-all ${
                    line.type === 'dialogue' ? 'ml-32' : ''
                  } ${isActive ? 'bg-accent/15 border border-accent/40 text-ink' : 'text-ink-muted hover:text-ink hover:bg-surface-hover'}`}
                >
                  {line.text}
                </p>
              );
            })}
          </main>
        </>
      )}

      {/* ── TELEPROMPTER MODE ── */}
      {hasContent && mode === 'teleprompter' && (
        <main
          ref={teleprompterRef}
          className="flex-1 overflow-y-auto px-8 py-16 pb-32"
          style={{ scrollBehavior: 'auto' }}
        >
          <div className="max-w-3xl mx-auto">
            {/* Speed control */}
            <div className="flex items-center gap-3 mb-10 justify-center">
              <span className="text-xs text-ink-muted">Scroll speed</span>
              <input
                type="range" min={60} max={400} step={10} value={wpm}
                onChange={(e) => { setWpm(Number(e.target.value)); if (isScrolling) { stopScroll(); startScroll(); } }}
                className="w-32 accent-accent"
              />
              <span className="text-xs text-ink-muted w-16">{wpm} WPM</span>
            </div>
            {/* Text — large for reading */}
            <div className="text-2xl leading-loose text-ink space-y-6">
              {lines.map((line, i) => {
                if (line.type === 'character') return (
                  <p key={i} className="text-sm font-mono font-bold text-accent-light">{line.text}</p>
                );
                if (line.type === 'direction') return (
                  <p key={i} className="text-lg text-ink-dim italic">{line.text}</p>
                );
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
            if (line.type === 'character') return (
              <p key={i} className="text-xs font-mono font-bold text-accent-light mt-3">{line.text}</p>
            );
            if (line.type === 'direction') return (
              <p key={i} className="text-sm text-ink-dim italic px-3">{line.text}</p>
            );
            const isActive = i === currentLineIdx;
            return (
              <p
                key={i}
                onClick={() => playLineFrom(i)}
                className={`text-lg leading-relaxed rounded-xl px-5 py-4 cursor-pointer transition-all ${
                  isActive ? 'bg-accent/15 border border-accent/40 text-ink' : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
                }`}
              >
                {line.text}
              </p>
            );
          })}
        </main>
      )}

      {/* ── PLAYBACK BAR (multi + reader) ── */}
      {hasContent && mode !== 'teleprompter' && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-surface-border">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
            <span className="text-xs text-ink-muted w-24 hidden sm:block">
              {currentLineIdx + 1} / {lines.filter(l => l.type !== 'character').length} lines
            </span>

            <div className="flex items-center gap-3 mx-auto">
              <button
                onClick={() => playLineFrom(Math.max(currentLineIdx - 1, 0))}
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
                onClick={() => playLineFrom(currentLineIdx + 1)}
                className="w-10 h-10 rounded-full bg-surface-card border border-surface-border hover:border-accent flex items-center justify-center transition-all"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Speed */}
            <div className="w-24 hidden sm:flex items-center gap-1">
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
      )}

      {/* ── TELEPROMPTER BAR ── */}
      {hasContent && mode === 'teleprompter' && (
        <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-surface-border">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-center gap-4">
            <button
              onClick={() => teleprompterRef.current?.scrollTo({ top: 0 })}
              className="flex items-center gap-1.5 px-3 py-2 bg-surface-card border border-surface-border hover:border-accent text-sm rounded-lg font-medium transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset
            </button>

            <button
              onClick={toggleScroll}
              className={`flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all shadow-lg ${
                isScrolling ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-accent hover:bg-accent/90 text-white'
              }`}
            >
              {isScrolling ? <><Pause className="w-4 h-4" /> Stop</> : <><Play className="w-4 h-4 ml-0.5" /> Start Scrolling</>}
            </button>

            <span className="text-xs text-ink-muted">Space to toggle</span>
          </div>
        </div>
      )}
    </div>
  );
}
