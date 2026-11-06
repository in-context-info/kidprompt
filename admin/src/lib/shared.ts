// Same sandbox the public /play route uses (backend/src/routes/play.ts) —
// duplicated rather than shared, like everything across the Worker boundary.
// Keep the two in step.
export const PREVIEW_CSP = [
  "sandbox allow-scripts allow-pointer-lock allow-modals",
  "default-src 'none'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

// $ per million tokens, keyed by the exact model string token_usage records.
// Unknown models price at the Opus rate so a new model never reads as free.
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
export function costUsd(model: string, input: number, output: number): number {
  const rate = PRICING[model] ?? PRICING["claude-opus-5-5"];
  return (input * rate.input + output * rate.output) / 1_000_000;
}
