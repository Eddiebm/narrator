const KEY = 'narrator-pronunciation';
export type PronunciationDict = Record<string, string>;

export function loadDict(): PronunciationDict {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    return JSON.parse(raw) as PronunciationDict;
  } catch {
    return {};
  }
}

export function saveDict(dict: PronunciationDict): void {
  localStorage.setItem(KEY, JSON.stringify(dict));
}

export function applyDict(text: string, dict: PronunciationDict): string {
  let result = text;
  for (const [find, replace] of Object.entries(dict)) {
    const escaped = find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    result = result.replace(re, replace);
  }
  return result;
}
