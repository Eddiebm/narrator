/**
 * Model routing for OpenRouter.
 * Match the model to the complexity of the task — don't use a sports car to pick up groceries.
 */
export const MODELS = {
  /**
   * Script generation: Gemini Flash 2.0 — fast enough to stay inside Vercel edge's 30s
   * hard limit, and produces quality narration. Sonnet was timing out (20-25s per slide).
   */
  scriptGeneration: 'google/gemini-2.0-flash-001',

  /**
   * Script refinement: editing an existing script with a plain-English instruction.
   * Simpler task — Gemini Flash is fast, cheap, and plenty capable for editing.
   */
  scriptRefinement: 'google/gemini-flash-1.5',
} as const;
