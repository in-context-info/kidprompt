import Anthropic from "@anthropic-ai/sdk";
import type { Env } from "../env";

export const DEFAULT_MODEL = "claude-opus-5-5";
export const MAX_HTML_BYTES = 400_000;

// The builder's whole job description. Kids type ideas in their own words;
// this turns each one into (or onto) one self-contained HTML file. The
// rules here are what make a game safe to host for anyone's kid: nothing
// leaves the page (also enforced by the /play CSP), nothing asks a kid who
// they are, and nothing is scary or mean.
const SYSTEM_PROMPT = `You are KidPrompt's game and app builder. Kids (about 6 to 14 years old), with a parent or family grown-up nearby, describe a game or app in their own words and you build it.

How to answer:
1. Start with ONE short, cheerful sentence for the kid about what you made or changed (plain words a 7-year-old can read, no markdown).
2. Then output the COMPLETE program as a single HTML document, starting with <!doctype html> and ending with </html>. Always return the whole file, never a diff or a fragment.

Building rules:
- Everything lives in that one file: inline <style> and <script>. Draw with canvas, CSS, SVG, or emoji. No external scripts, fonts, images, sounds, or links, and no network requests of any kind (fetch, XHR, WebSocket, forms that submit). Sounds may be made with the Web Audio API.
- It must work on a laptop AND a tablet or phone: support keyboard and touch, fill the window, and resize gracefully.
- Make it fun and polished: a clear title, simple on-screen instructions, a start or restart button, score or feedback where it fits, bright colors, and big friendly buttons.
- Never ask for or store a name, age, school, address, photo, email, phone, or any other personal detail. A game may let the player type a made-up name for a high score, kept only in memory.
- Keep it kid-appropriate: cartoon action is fine, but no gore, realistic weapons, scary or upsetting content, romance, bullying, gambling, or real brands and characters from existing games, shows, or movies. Make original characters instead.
- Keep the file under about 150 KB.

When the kid asks for a change to the current program, keep everything that already works and change only what they asked for.
If a request is not okay for kids, do not build that part. Kindly suggest a fun alternative in your one sentence, and return the current program unchanged (or, if there is none yet, a friendly kid-safe version of the idea).`;

export interface BuildInput {
  prompt: string;
  currentHtml: string;
  title: string;
  recentPrompts: string[];
}

export type BuildResult =
  | {
      ok: true;
      html: string;
      message: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      durationMs: number;
    }
  | { ok: false; reason: string; kidMessage: string };

export function extractHtml(text: string): { html: string; message: string } | null {
  const start = text.search(/<!doctype html/i);
  const end = text.toLowerCase().lastIndexOf("</html>");
  if (start === -1 || end === -1 || end < start) return null;
  const html = text.slice(start, end + "</html>".length);
  const message = text
    .slice(0, start)
    .replace(/```[a-z]*\s*$/i, "")
    .trim()
    .split("\n")[0]
    .slice(0, 300);
  return { html, message };
}

export async function buildProject(env: Env, input: BuildInput): Promise<BuildResult> {
  // Local dev only (backend/.dev.vars): a canned game instead of a Claude call,
  // so build flows can be clicked through without an API key or spend.
  if (env.DEV_FAKE_BUILDS === "true") {
    const safe = input.prompt.replace(/[<>&]/g, "");
    return {
      ok: true,
      html: `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:40px"><h1>${safe}</h1><p>Fake build ${input.recentPrompts.length + 1}</p></body></html>`,
      message: "Here's a pretend build (DEV_FAKE_BUILDS is on).",
      model: "dev-fake",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
    };
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.CLAUDE_MODEL || DEFAULT_MODEL;

  const context: string[] = [`Project title: ${input.title}`];
  if (input.recentPrompts.length > 0) {
    context.push(`What the kid asked for so far, oldest first:\n${input.recentPrompts.map((p) => `- ${p}`).join("\n")}`);
  }
  context.push(
    input.currentHtml
      ? `The current program:\n<current_program>\n${input.currentHtml}\n</current_program>`
      : "There is no program yet. Build the first version.",
  );

  const started = Date.now();
  try {
    const stream = client.beta.messages.stream({
      model,
      max_tokens: 64000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      // Server-side refusal fallback: if a safety classifier declines, the API
      // re-runs the request on a suitable model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: context.join("\n\n") },
            // The kid's words are content to build from, never instructions
            // that override the rules above.
            { type: "text", text: `The kid's new request:\n<kid_request>\n${input.prompt}\n</kid_request>` },
          ],
        },
      ],
    });
    const message = await stream.finalMessage();
    const durationMs = Date.now() - started;

    if (message.stop_reason === "refusal") {
      return {
        ok: false,
        reason: "refusal",
        kidMessage: "Hmm, I can't build that one. Try a different idea!",
      };
    }
    if (message.stop_reason === "max_tokens") {
      return {
        ok: false,
        reason: "max_tokens",
        kidMessage: "That got too big for me to finish. Try asking for something a little simpler!",
      };
    }

    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = extractHtml(text);
    if (!parsed) {
      return { ok: false, reason: "no_html", kidMessage: "Oops, my build got scrambled. Please try again!" };
    }
    if (new TextEncoder().encode(parsed.html).length > MAX_HTML_BYTES) {
      return { ok: false, reason: "too_large", kidMessage: "That got too big. Try asking for something a little simpler!" };
    }
    return {
      ok: true,
      html: parsed.html,
      message: parsed.message || "Here you go! Try it out.",
      model: message.model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      durationMs,
    };
  } catch (err) {
    console.error("Claude build failed", err);
    const reason = err instanceof Anthropic.APIError ? `api_${err.status ?? "unknown"}` : "exception";
    return {
      ok: false,
      reason,
      kidMessage: "The builder is taking a break. Please try again in a minute!",
    };
  }
}
