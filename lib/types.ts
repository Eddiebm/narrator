export interface ParsedSlide {
  index: number;
  title: string;
  body: string[];
  notes: string;
}

export interface SlideData extends ParsedSlide {
  script: string;
  voice: Voice | null;
  speed: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  isGeneratingScript: boolean;
  isGeneratingAudio: boolean;
  error: string | null;
}

export type Voice = string;

export type PresentationStyle = 'professional' | 'storytelling' | 'technical' | 'conversational';

export const VOICES: { id: Voice; name: string; description: string; region: string }[] = [
  // African English
  { id: 'en-NG-AbeoNeural',      name: 'Abeo',      description: 'Male',   region: 'Nigerian' },
  { id: 'en-NG-EzinneNeural',    name: 'Ezinne',    description: 'Female', region: 'Nigerian' },
  { id: 'en-GH-NanaNeural',      name: 'Nana',      description: 'Female', region: 'Ghanaian' },
  { id: 'en-KE-AsiliaNeural',    name: 'Asilia',    description: 'Female', region: 'Kenyan' },
  { id: 'en-KE-ChilembaNeural',  name: 'Chilemba',  description: 'Male',   region: 'Kenyan' },
  { id: 'en-ZA-LeahNeural',      name: 'Leah',      description: 'Female', region: 'S. African' },
  { id: 'en-ZA-LukeNeural',      name: 'Luke',      description: 'Male',   region: 'S. African' },
  // British
  { id: 'en-GB-SoniaNeural',     name: 'Sonia',     description: 'Female', region: 'British' },
  { id: 'en-GB-RyanNeural',      name: 'Ryan',      description: 'Male',   region: 'British' },
  // American
  { id: 'en-US-JennyNeural',     name: 'Jenny',     description: 'Female', region: 'American' },
  { id: 'en-US-ChristopherNeural', name: 'Christopher', description: 'Male', region: 'American' },
  // Australian
  { id: 'en-AU-NatashaNeural',   name: 'Natasha',   description: 'Female', region: 'Australian' },
  { id: 'en-AU-WilliamNeural',   name: 'William',   description: 'Male',   region: 'Australian' },
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
