/**
 * Model routing for OpenRouter.
 * Match the model to the complexity of the task — don't use a sports car to pick up groceries.
 */
export const MODELS = {
  /**
   * Script generation: creative, needs quality narrative voice.
   * Sonnet 4.5 — strong creative writing, good instruction-following.
   */
  scriptGeneration: 'anthropic/claude-sonnet-4.5',

  /**
   * Script refinement: editing an existing script with a plain-English instruction.
   * Simpler task — Gemini Flash is fast, cheap, and plenty capable for editing.
   */
  scriptRefinement: 'google/gemini-flash-1.5',
} as const;
