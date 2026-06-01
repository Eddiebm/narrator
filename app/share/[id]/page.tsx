'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, Loader2, Radio, Rss } from 'lucide-react';

interface ShareData {
  type: 'reader' | 'podcast' | 'script' | 'narrator';
  name: string;
  content: {
    paragraphs?: string[];
    voice?: string;
    speed?: number;
    lines?: { speaker: string; text: string }[];
    hosts?: { name: string; voice: string }[];
    slides?: { title: string; script: string }[];
  };
  audio_url: string | null;
}

const AVATAR_COLOURS = [
  'bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500',
];

export default function SharePage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<number, string>>(new Map());
  const audioUrlsRef = useRef<string[]>([]);
  const currentIdxRef = useRef(0);

  useEffect(() => { currentIdxRef.current = currentIdx; }, [currentIdx]);

  useEffect(() => {
    fetch(`/api/share/${params.id}`)
      .then(r => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    return () => { audioUrlsRef.current.forEach(URL.revokeObjectURL); };
  }, []);

  const fetchReaderAudio = useCallback(async (idx: number): Promise<string | null> => {
    if (audioCacheRef.current.has(idx)) return audioCacheRef.current.get(idx)!;
    if (!data?.content.paragraphs) return null;
    const text = data.content.paragraphs[idx];
    if (!text) return null;
    try {
      const res = await fetch('/api/reader-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: data.content.voice ?? 'nova', speed: data.content.speed ?? 1.0 }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlsRef.current.push(url);
      audioCacheRef.current.set(idx, url);
      return url;
    } catch { return null; }
  }, [data]);

  const fetchPodcastAudio = useCallback(async (idx: number): Promise<string | null> => {
    if (audioCacheRef.current.has(idx)) return audioCacheRef.current.get(idx)!;
    if (!data?.content.lines || !data.content.hosts) return null;
    const line = data.content.lines[idx];
    if (!line) return null;
    const host = data.content.hosts.find(h => h.name === line.speaker);
    const voice = host?.voice ?? 'en-GB-RyanNeural';
    try {
      const res = await fetch('/api/reader-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: line.text, voice }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      audioUrlsRef.current.push(url);
      audioCacheRef.current.set(idx, url);
      return url;
    } catch { return null; }
  }, [data]);

  const playFrom = useCallback(async (idx: number) => {
    if (!data) return;
    const items = data.type === 'reader' ? data.content.paragraphs : data.content.lines;
    if (!items || idx >= items.length) { setIsPlaying(false); return; }

    setCurrentIdx(idx);
    currentIdxRef.current = idx;
    setIsLoading(true);

    const url = data.type === 'reader'
      ? await fetchReaderAudio(idx)
      : await fetchPodcastAudio(idx);

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
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') setIsPlaying(false);
    }
  }, [data, fetchReaderAudio, fetchPodcastAudio]);

  const togglePlay = useCallback(() => {
    if (!data) return;
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
  }, [isPlaying, data, currentIdx, playFrom]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent-light animate-spin" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <Radio className="w-10 h-10 text-ink-muted" />
        <h1 className="text-xl font-semibold text-ink">Share not found</h1>
        <p className="text-sm text-ink-muted text-center">
          This link may have expired or does not exist.
        </p>
      </div>
    );
  }

  const isPodcast = data.type === 'podcast';
  const isScript = data.type === 'script';
  const isNarrator = data.type === 'narrator';
  const lines = data.content.lines ?? [];
  const paragraphs = data.content.paragraphs ?? [];
  const hosts = data.content.hosts ?? [];
  const narratorSlides = data.content.slides ?? [];

  const hostColour = (name: string) => {
    const idx = hosts.findIndex(h => h.name === name);
    return AVATAR_COLOURS[idx % AVATAR_COLOURS.length];
  };

  return (
    <div className="min-h-screen flex flex-col">
      <audio ref={audioRef} />

      {/* Standalone header — no nav */}
      <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur border-b border-surface-border">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-3">
          <span className="font-semibold text-ink">Narrator</span>
          <span className="text-ink-dim">/</span>
          <span className="text-sm text-ink-muted truncate">{data.name}</span>
          {isPodcast && data.audio_url && (
            <a
              href={`/api/rss/${params.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-surface-card border border-surface-border hover:border-accent text-sm rounded-lg font-medium transition-all text-ink-muted"
            >
              <Rss className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">RSS Feed</span>
            </a>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 pb-10">
        {isNarrator && (
          <div className="flex flex-col gap-4">
            {narratorSlides.map((slide, i) => (
              <div key={i} className="bg-surface-card border border-surface-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface/40">
                  <span className="text-xs font-mono text-ink-muted w-6 text-right flex-shrink-0">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-medium text-sm text-ink truncate flex-1">{slide.title}</h3>
                </div>
                <p className="px-4 py-3 text-sm text-ink leading-relaxed whitespace-pre-wrap">{slide.script}</p>
              </div>
            ))}
          </div>
        )}
        {isScript && (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Radio className="w-8 h-8 text-ink-muted" />
            <p className="text-ink-muted text-sm">Script sharing is not yet supported for playback.</p>
          </div>
        )}
        {!isPodcast && !isScript && (
          <div className="flex flex-col gap-3">
            {paragraphs.map((para, i) => (
              <p
                key={i}
                onClick={() => playFrom(i)}
                className={`text-lg leading-relaxed rounded-xl px-5 py-4 cursor-pointer transition-all ${
                  i === currentIdx && isPlaying
                    ? 'bg-accent/15 border border-accent/40 text-ink'
                    : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
                }`}
              >
                {para}
              </p>
            ))}
          </div>
        )}

        {isPodcast && (
          <div className="flex flex-col gap-3">
            {lines.map((line, i) => {
              const isActive = i === currentIdx && isPlaying;
              const colour = hostColour(line.speaker);
              const isLeft = hosts.findIndex(h => h.name === line.speaker) % 2 === 0;

              return (
                <div
                  key={i}
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
          </div>
        )}
      </main>

      {/* Playback bar — hidden for script/narrator shares */}
      {!isScript && !isNarrator && <div className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur border-t border-surface-border">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-center">
          <button
            onClick={togglePlay}
            disabled={isLoading}
            className="w-14 h-14 rounded-full bg-accent hover:bg-accent/90 disabled:opacity-50 flex items-center justify-center transition-all shadow-lg"
          >
            {isLoading
              ? <Loader2 className="w-6 h-6 text-white animate-spin" />
              : isPlaying
              ? <Pause className="w-6 h-6 text-white" />
              : <Play className="w-6 h-6 text-white ml-0.5" />}
          </button>
        </div>
      </div>}
    </div>
  );
}
