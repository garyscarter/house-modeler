/**
 * Model choices, kept apart from client.ts so the store and Settings can
 * list them without loading the Anthropic SDK (which loads on first AI use).
 */
export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (default)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (faster, cheaper)" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1 (most capable)" },
];
export const DEFAULT_MODEL = MODELS[0].id;
