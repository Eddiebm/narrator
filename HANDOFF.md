# Narrator — Handoff Notes
_Last updated: 2026-05-24_

## What this app is
A Next.js 14 App Router web app that converts PowerPoint presentations into AI-narrated audio. Deployed at **narrator-two.vercel.app** (GitHub: Eddiebm/narrator).

Primary user: **Courtney** — visually impaired, uses the Reader daily to have documents read to him.

---

## Live pages

| Route | What it does |
|---|---|
| `/` | Home — upload PPTX, pick style, generate scripts |
| `/editor` | Per-slide script editor with TTS audio generation and PPTX export |
| `/reader` | Document reader — PDF/DOCX/PPTX/paste, TTS playback, voice commands |
| `/script` | Script reader — multi-character voices, teleprompter, reader modes |
| `/podcast` | AI podcast generator — multi-host discussion of any deck |
| `/share/[id]` | Shareable view for reader or podcast (needs DATABASE_URL) |

---

## Tech stack

- **Framework**: Next.js 14 App Router, TypeScript strict
- **Deployment**: Vercel (team: `eddiebms-projects`, project: `narrator`)
- **TTS**: Microsoft Edge TTS (`msedge-tts` npm) — free fallback; OpenAI TTS-1-HD if `OPENAI_API_KEY` set
- **LLM**: OpenRouter via native `fetch` — `anthropic/claude-sonnet-4-5` for scripts/podcast, `google/gemini-flash-1.5` for refinement and translation
- **PPTX manipulation**: JSZip (client-side)
- **Storage**: IndexedDB (`lib/idb.ts`) — PPTX file + session history
- **DB** (not yet active): `@neondatabase/serverless` — needs `DATABASE_URL` env var
- **Blob storage** (not yet active): `@vercel/blob` — needs `BLOB_READ_WRITE_TOKEN` env var

---

## Environment variables

| Var | Status | Used for |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ Set on Vercel | Script generation, refinement, translation, podcast |
| `OPENAI_API_KEY` | ❌ Not set | Optional — upgrades Reader TTS to OpenAI HD |
| `DATABASE_URL` | ❌ Not set | Shareable links + RSS — create a Neon project and add |
| `BLOB_READ_WRITE_TOKEN` | ❌ Not set | Podcast MP3 hosting for RSS — enable Vercel Blob in dashboard |

To activate shareable links + RSS:
1. Go to console.neon.tech → create project `narrator` → copy connection string
2. `vercel env add DATABASE_URL production` → paste it
3. Go to vercel.com/eddiebms-projects/narrator → Storage → Create Blob store
4. `vercel --prod` to redeploy

---

## Key files

### API routes (all `export const runtime = 'edge'` except reader-tts which uses nodejs for msedge-tts)

| Route | What it does |
|---|---|
| `app/api/parse/route.ts` | Parses PPTX → `{ slides: ParsedSlide[], name }` |
| `app/api/generate/route.ts` | Generates scripts for slides via Claude |
| `app/api/refine/route.ts` | Refines a script via Gemini Flash |
| `app/api/translate/route.ts` | Translates text to target language via Gemini Flash |
| `app/api/tts/route.ts` | TTS for editor (Edge TTS or OpenAI) |
| `app/api/reader-tts/route.ts` | TTS for reader/script/podcast — runtime: nodejs |
| `app/api/extract-doc/route.ts` | Extracts text from PDF/DOCX |
| `app/api/podcast-gen/route.ts` | Generates podcast script as `PodcastLine[]` via Claude |
| `app/api/podcast-upload/route.ts` | Uploads podcast MP3 to Vercel Blob (needs BLOB_READ_WRITE_TOKEN) |
| `app/api/share/route.ts` | POST creates share record in Neon (needs DATABASE_URL) |
| `app/api/share/[id]/route.ts` | GET retrieves share by UUID |
| `app/api/rss/[id]/route.ts` | RSS 2.0 XML feed for podcast episodes |

### Libraries

| File | What it does |
|---|---|
| `lib/types.ts` | All shared types: `SlideData`, `Voice`, `NarratorSession`, `VOICES`, `STYLES` |
| `lib/idb.ts` | IndexedDB: `savePptx`/`loadPptx` (v1) + `saveSession`/`listSessions`/`deleteSession`/`loadSession` (v2) |
| `lib/pptx-audio.ts` | Embeds MP3 audio into PPTX XML — uses `p:pic` shape, dual relationships, timing in `mainSeq` |
| `lib/pronunciation.ts` | `loadDict`/`saveDict`/`applyDict` — word-boundary substitution from localStorage |
| `lib/video-export.ts` | Client-side Canvas + MediaRecorder → .webm/.mp4 video of slides+audio |
| `lib/db.ts` | Neon lazy connection — `getDb()` throws if `DATABASE_URL` missing |

### Components

| File | What it does |
|---|---|
| `components/GlobalNav.tsx` | Sticky top nav — Narrator/Reader/Script/Podcast links, hidden on /editor |
| `components/SlideCard.tsx` | Per-slide editor card — script textarea, translate, refine, audio controls, SlidePreview |
| `components/SlidePreview.tsx` | Canvas thumbnail rendering slide title+body in 16:9 dark theme |
| `components/PronunciationEditor.tsx` | Modal to add/edit/delete pronunciation substitutions |
| `components/ShortcutModal.tsx` | Keyboard shortcut reference modal |
| `components/ShortcutGuide.tsx` | Global `?` key listener that opens ShortcutModal — mounted in layout |

---

## Features built (complete)

### Core
- PPTX upload → AI script generation per slide → TTS audio → PPTX export with embedded auto-play audio
- Per-slide and global voice/speed selection
- Individual MP3 download, ZIP of all MP3s, Full MP3 (concatenated)
- Video export (Canvas + MediaRecorder → .webm/.mp4)
- Presentation history (IndexedDB v2) — auto-saved, shown on home page

### Reader (`/reader`)
- Upload PDF/DOCX/PPTX or paste text → TTS paragraph-by-paragraph
- Voice commands: play, stop, next, back, repeat, restart, stop listening
- Background pre-generation of first 3 paragraphs on load
- Waveform progress bar under active paragraph (timeupdate)
- MP3 download (full reading concatenated)
- Share link (needs DATABASE_URL)
- Translate all paragraphs (8 languages via Gemini)
- Pronunciation dictionary applied before every TTS call

### Script (`/script`)
- Multi-character mode (ALL CAPS = character cue, different voice per character)
- Teleprompter mode (auto-scroll at configurable WPM)
- Reader mode (paragraph-by-paragraph)
- Background pre-generation of first 3 speakable lines
- MP3 download, PPTX/PDF/DOCX/TXT/FDX upload

### Podcast (`/podcast`)
- Configure 2-4 hosts with name, personality, voice
- AI generates 20-35 exchange conversation about the deck
- Chat bubble UI alternating per host
- Chapter timestamps panel (MM:SS, clickable to jump)
- Transcript download (TXT), MP3 download (full episode)
- Share + RSS feed (needs DATABASE_URL + BLOB_READ_WRITE_TOKEN)
- Pronunciation dictionary applied

### Editor (`/editor`)
- Per-slide: edit script, AI refine, translate (8 languages), per-voice/speed override, generate audio, play/download
- Slide preview thumbnail (canvas, 16:9) beside each script
- Global: Generate All, ZIP MP3s, Full MP3, PPTX export, Video export
- Scrollable header on mobile

### Global
- Site-wide navigation (GlobalNav)
- `?` key opens keyboard shortcut guide (ShortcutGuide + ShortcutModal)
- Pronunciation dictionary (localStorage, applies everywhere)
- Translation via Gemini Flash (`/api/translate`)
- Mobile: scrollable headers, 48px touch targets on Reader playback bar

---

## Pending / not built yet

| Feature | Notes |
|---|---|
| Voice cloning | User said "not yet" — would need ElevenLabs API key (`ELEVENLABS_API_KEY`) |
| Shareable links (active) | Code is built, just needs `DATABASE_URL` on Vercel |
| Podcast RSS (active) | Code is built, needs `DATABASE_URL` + `BLOB_READ_WRITE_TOKEN` |
| Slide image preview (real) | Current preview renders text on canvas — not the actual PPTX slide visual |
| Offline / PWA | Not started |

---

## Deploy command
```bash
cd /Users/eddiebannerman-menson/narrator
vercel --prod
```

## Critical PPTX audio notes
PowerPoint requires audio shapes to be `p:pic` (NOT `p:sp`). Two relationships needed per audio file: one `audio` type for `p:audioFile r:link` and one `media` type for `a:hlinkClick r:id`. Timing goes inside `mainSeq` with `delay="0"` for auto-play. `stripNarratorAudio()` must be called before re-embedding to prevent duplicates. See `lib/pptx-audio.ts`.

## CLAUDE.md rules (always follow)
- No Supabase — Neon only (`@neondatabase/serverless`)
- No Supabase Auth — custom JWT cookies (`jose`)
- Every `app/api/**/route.ts` must have `export const runtime = "edge"` as first line (exception: `reader-tts` needs `nodejs` for msedge-tts)
- No hardcoded secret fallbacks — throw if env var missing
- No comments explaining what code does — only WHY
