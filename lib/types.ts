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

export type Voice = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'nova' | 'onyx' | 'sage' | 'shimmer';

export type PresentationStyle = 'professional' | 'storytelling' | 'technical' | 'conversational';

export const VOICES: { id: Voice; name: string; description: string }[] = [
  { id: 'nova',    name: 'Nova',    description: 'Female, warm & engaging' },
  { id: 'coral',   name: 'Coral',   description: 'Female, clear & bright' },
  { id: 'sage',    name: 'Sage',    description: 'Female, calm & measured' },
  { id: 'shimmer', name: 'Shimmer', description: 'Female, soft & expressive' },
  { id: 'onyx',    name: 'Onyx',    description: 'Male, deep & authoritative' },
  { id: 'echo',    name: 'Echo',    description: 'Male, conversational' },
  { id: 'fable',   name: 'Fable',   description: 'British, expressive' },
  { id: 'ash',     name: 'Ash',     description: 'Neutral, direct' },
  { id: 'alloy',   name: 'Alloy',   description: 'Neutral, balanced' },
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
