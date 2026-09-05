import Anthropic from "@anthropic-ai/sdk";

export const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (default)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (faster, cheaper)" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1 (most capable)" },
];

/**
 * The app is a throwaway single-user tool with no backend, so the key lives in
 * the browser and calls go straight to the API. Never deploy this publicly
 * with a key baked in.
 */
export function makeClient(apiKey: string): Anthropic {
  if (!apiKey.trim()) throw new Error("Add your Anthropic API key in Settings first.");
  return new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });
}

/** Human-readable message for API failures. */
export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "API key rejected. Check it in Settings.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by the API. Wait a moment and retry.";
  if (e instanceof Anthropic.BadRequestError) return `Bad request: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach the Anthropic API (network or CORS).";
  if (e instanceof Anthropic.APIError) return `API error ${e.status}: ${e.message}`;
  if (e instanceof Error) return e.message;
  return String(e);
}
