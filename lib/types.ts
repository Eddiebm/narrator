export interface ParsedSlide {
  index: number;
  title: string;
  body: string[];
  notes: string;
}

export interface SlideData extends ParsedSlide {
  script: string;
  voice: Voice;
  speed: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  isGeneratingScript: boolean;
  isGeneratingAudio: boolean;
  error: string | null;
}

// ElevenLabs voice IDs
export type Voice = string;

export type PresentationStyle = 'professional' | 'storytelling' | 'technical' | 'conversational';

export const VOICES: { id: Voice; name: string; description: string }[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',  description: 'Female, American, warm' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni',  description: 'Male, American, articulate' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie',  description: 'Male, Australian, natural' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice',    description: 'Female, British, confident' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George',   description: 'Male, British, warm' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda',  description: 'Female, American, clear' },
];

export const STYLES: { id: PresentationStyle; label: string; description: string }[] = [
  { id: 'professional', label: 'Professional', description: 'Polished and confident' },
  { id: 'storytelling', label: 'Storytelling', description: 'Narrative arc with emotion' },
  { id: 'technical', label: 'Technical', description: 'Precise and data-driven' },
  { id: 'conversational', label: 'Conversational', description: 'Relaxed and accessible' },
];

export interface NarratorSession {
  name: string;
  style: PresentationStyle;
  slides: ParsedSlide[];
  scripts: string[];
  createdAt: number;
}
