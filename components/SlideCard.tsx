'use client';

import { useState, useRef } from 'react';
import SlidePreview from './SlidePreview';
import {
  Play,
  Pause,
  Download,
  Loader2,
  Wand2,
  ChevronDown,
  AlertCircle,
  Mic,
  Languages,
} from 'lucide-react';
import type { SlideData, Voice } from '@/lib/types';
import { VOICES } from '@/lib/types';

interface Props {
  slide: SlideData;
  globalVoice: Voice;
  globalSpeed: number;
  onScriptChange: (script: string) => void;
  onRefine: (instruction: string) => Promise<void>;
  onGenerateAudio: () => Promise<void>;
  onVoiceChange: (voice: Voice) => void;
  onSpeedChange: (speed: number) => void;
  onTranslate: (lang: string) => void;
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function estimatedSeconds(text: string, speed: number) {
  // ~150 words per minute speaking rate
  return Math.round((wordCount(text) / 150) * 60 * (1 / speed));
}

const TRANSLATE_LANGUAGES = [
  'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Mandarin', 'Yoruba', 'Swahili',
];

export default function SlideCard({
  slide,
  globalVoice,
  globalSpeed,
  onScriptChange,
  onRefine,
  onGenerateAudio,
  onVoiceChange,
  onSpeedChange,
  onTranslate,
}: Props) {
  const [refineInput, setRefineInput] = useState('');
  const [showRefine, setShowRefine] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [translateLang, setTranslateLang] = useState('Spanish');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const voice = slide.voice || globalVoice;
  const speed = slide.speed || globalSpeed;
  const words = wordCount(slide.script);
  const secs = estimatedSeconds(slide.script, speed);

  const handleRefineSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refineInput.trim()) return;
    await onRefine(refineInput.trim());
    setRefineInput('');
    setShowRefine(false);
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const handleDownload = () => {
    if (!slide.audioUrl) return;
    const a = document.createElement('a');
    a.href = slide.audioUrl;
    const num = String(slide.index + 1).padStart(2, '0');
    const safeName = slide.title.slice(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase();
    a.download = `${num}-${safeName}.mp3`;
    a.click();
  };

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl overflow-hidden hover:border-surface-border/80 transition-colors">
      {/* Card header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border bg-surface/40">
        <span className="text-xs font-mono text-ink-muted w-6 text-right flex-shrink-0">
          {String(slide.index + 1).padStart(2, '0')}
        </span>
        <h3 className="font-medium text-sm text-ink truncate flex-1">{slide.title}</h3>
        {slide.audioUrl && (
          <span className="text-xs text-accent-light flex items-center gap-1">
            <Mic className="w-3 h-3" /> Audio ready
          </span>
        )}
      </div>

      {/* Script editor + slide preview */}
      <div className="flex gap-3 px-4 pt-3 pb-2">
        {/* Mini slide thumbnail — hidden on small screens */}
        <div className="hidden md:block flex-shrink-0 w-44">
          <SlidePreview title={slide.title} body={slide.body} index={slide.index} />
        </div>

        <div className="flex-1 flex flex-col">
        <textarea
          value={slide.script}
          onChange={(e) => onScriptChange(e.target.value)}
          rows={5}
          className="w-full bg-transparent text-sm text-ink leading-relaxed focus:outline-none placeholder-ink-dim resize-y"
          placeholder="No script generated for this slide…"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-ink-dim">
            {words} words · ~{secs}s
          </span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <select
                value={translateLang}
                onChange={(e) => setTranslateLang(e.target.value)}
                disabled={slide.isGeneratingScript || !slide.script.trim()}
                className="appearance-none bg-surface border border-surface-border text-xs text-ink rounded-lg pl-2 pr-5 py-1 focus:outline-none focus:border-accent cursor-pointer disabled:opacity-40"
              >
                {TRANSLATE_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
              <button
                onClick={() => onTranslate(translateLang)}
                disabled={slide.isGeneratingScript || !slide.script.trim()}
                className="text-xs text-ink-muted hover:text-accent-light transition-colors flex items-center gap-1 disabled:opacity-40"
              >
                {slide.isGeneratingScript ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Languages className="w-3 h-3" />
                )}
                Translate
              </button>
            </div>
            <button
              onClick={() => setShowRefine((v) => !v)}
              className="text-xs text-ink-muted hover:text-accent-light transition-colors flex items-center gap-1"
            >
              <Wand2 className="w-3 h-3" />
              Refine
            </button>
          </div>
        </div>
        </div>{/* end flex-1 */}
      </div>{/* end two-col */}

      {/* Refine input */}
      {showRefine && (
        <form onSubmit={handleRefineSubmit} className="px-4 pb-3 flex gap-2">
          <input
            value={refineInput}
            onChange={(e) => setRefineInput(e.target.value)}
            placeholder="e.g. make this more exciting, shorten to 30 seconds…"
            disabled={slide.isGeneratingScript}
            autoFocus
            className="flex-1 bg-surface border border-surface-border rounded-lg px-3 py-1.5 text-sm text-ink placeholder-ink-dim focus:outline-none focus:border-accent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={slide.isGeneratingScript || !refineInput.trim()}
            className="px-3 py-1.5 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm rounded-lg font-medium transition-all flex items-center gap-1.5"
          >
            {slide.isGeneratingScript ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              'Apply'
            )}
          </button>
        </form>
      )}

      {/* Error */}
      {slide.error && (
        <div className="px-4 pb-3 flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {slide.error}
        </div>
      )}

      {/* Footer: voice + generate */}
      <div className="px-4 py-3 border-t border-surface-border flex flex-wrap items-center gap-3">
        {/* Voice override */}
        <div className="relative flex-shrink-0">
          <select
            value={voice}
            onChange={(e) => onVoiceChange(e.target.value as Voice)}
            className="appearance-none bg-surface border border-surface-border text-xs text-ink rounded-lg pl-2.5 pr-6 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
          >
            {VOICES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.region} {v.description}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
        </div>

        {/* Speed override */}
        <div className="relative flex-shrink-0">
          <select
            value={speed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="appearance-none bg-surface border border-surface-border text-xs text-ink rounded-lg pl-2.5 pr-6 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
          >
            {[0.75, 0.9, 1.0, 1.1, 1.25].map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
        </div>

        <div className="flex-1" />

        {/* Audio player controls */}
        {slide.audioUrl && (
          <>
            <audio
              ref={audioRef}
              src={slide.audioUrl}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
            <button
              onClick={handlePlayPause}
              className="w-7 h-7 rounded-full bg-accent/20 hover:bg-accent/30 flex items-center justify-center transition-all"
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5 text-accent-light" />
              ) : (
                <Play className="w-3.5 h-3.5 text-accent-light ml-0.5" />
              )}
            </button>
            <button
              onClick={handleDownload}
              className="w-7 h-7 rounded-full bg-surface border border-surface-border hover:border-accent flex items-center justify-center transition-all"
            >
              <Download className="w-3.5 h-3.5 text-ink-muted" />
            </button>
          </>
        )}

        {/* Generate audio */}
        <button
          onClick={onGenerateAudio}
          disabled={slide.isGeneratingAudio || !slide.script.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-surface-border hover:border-accent disabled:opacity-40 text-xs rounded-lg font-medium transition-all"
        >
          {slide.isGeneratingAudio ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Mic className="w-3.5 h-3.5" />
          )}
          {slide.audioUrl ? 'Regenerate' : 'Generate Audio'}
        </button>
      </div>
    </div>
  );
}
