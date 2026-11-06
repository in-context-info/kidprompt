import { Hono } from "hono";
import type { Env } from "../env";
import { escapeHtml, nav, page, when } from "../lib/layout";
import { costUsd, PREVIEW_CSP } from "../lib/shared";

export const guests = new Hono<{ Bindings: Env }>();

const DAY_MS = 86_400_000;

interface Window {
  label: string;
  since: number;
}

// "Try it" without an account: how many strangers build, what it costs, how
// many turn into family accounts, and how often the limits turn them away.
guests.get("/guests", async (c) => {
  const now = Date.now();
  const windows: Window[] = [
    { label: "24 hours", since: now - DAY_MS },
    { label: "7 days", since: now - 7 * DAY_MS },
    { label: "30 days", since: now - 30 * DAY_MS },
  ];

  const rows = await Promise.all(
    windows.map(async (w) => {
      const [started, built, claimed, usage, blocks, failures] = await c.env.DB.batch([
        c.env.DB.prepare("SELECT COUNT(*) AS n FROM guest_projects WHERE created_at > ?").bind(w.since),
        c.env.DB.prepare("SELECT COUNT(*) AS n FROM guest_projects WHERE created_at > ? AND html != ''").bind(w.since),
        c.env.DB.prepare("SELECT COUNT(*) AS n FROM guest_projects WHERE created_at > ? AND claimed_at IS NOT NULL").bind(w.since),
        c.env.DB.prepare(
          `SELECT model, COUNT(*) AS builds, SUM(input_tokens) AS input, SUM(output_tokens) AS output
           FROM token_usage WHERE email LIKE 'guest:%' AND created_at > ? GROUP BY model`,
        ).bind(w.since),
        c.env.DB.prepare("SELECT reason, COUNT(*) AS n FROM guest_blocks WHERE created_at > ? GROUP BY reason").bind(w.since),
        c.env.DB.prepare("SELECT COUNT(*) AS n FROM claude_call_failures WHERE email LIKE 'guest:%' AND created_at > ?").bind(w.since),
      ]);
      const n = (r: D1Result) => (r.results[0] as { n: number } | undefined)?.n ?? 0;
      const u = usage.results as { model: string; builds: number; input: number; output: number }[];
      const b = Object.fromEntries((blocks.results as { reason: string; n: number }[]).map((x) => [x.reason, x.n]));
      const builtCount = n(built);
      return {
        label: w.label,
        started: n(started),
        built: builtCount,
        builds: u.reduce((s, x) => s + x.builds, 0),
        cost: u.reduce((s, x) => s + costUsd(x.model, x.input, x.output), 0),
        claimed: n(claimed),
        conversion: builtCount ? Math.round((n(claimed) / builtCount) * 100) : 0,
        blockedGuest: b.guest_limit ?? 0,
        blockedIp: b.ip_limit ?? 0,
        blockedGlobal: b.global_limit ?? 0,
        failures: n(failures),
      };
    }),
  );

  const recent = await c.env.DB.prepare(
    `SELECT g.id, g.title, g.versions, g.created_at, g.updated_at, g.claimed_by_email, g.claimed_project_id,
       (SELECT COUNT(*) FROM token_usage t WHERE t.project_id = g.id) AS builds
     FROM guest_projects g ORDER BY g.created_at DESC LIMIT 50`,
  ).all<{
    id: string;
    title: string;
    versions: string;
    created_at: number;
    updated_at: number;
    claimed_by_email: string | null;
    claimed_project_id: string | null;
    builds: number;
  }>();

  const statRow = (label: string, pick: (r: (typeof rows)[number]) => string) =>
    `<tr><td>${label}</td>${rows.map((r) => `<td><b>${pick(r)}</b></td>`).join("")}</tr>`;

  const recentRows = recent.results
    .map((g) => {
      const prompts = (JSON.parse(g.versions) as { prompt: string }[]).map((v) => v.prompt);
      return `<tr>
        <td>${g.builds ? `<a href="/guests/${escapeHtml(g.id)}/preview" target="_blank">${escapeHtml(g.title)}</a>` : escapeHtml(g.title)}</td>
        <td>${prompts.map((p) => `<div>• ${escapeHtml(p.slice(0, 140))}</div>`).join("") || '<span class="muted">no build yet</span>'}</td>
        <td>${g.builds}</td>
        <td>${
          g.claimed_by_email
            ? `✅ ${escapeHtml(g.claimed_by_email)}${g.claimed_project_id ? ` · <a href="/review/${escapeHtml(g.claimed_project_id)}">project</a>` : ""}`
            : '<span class="muted">not yet</span>'
        }</td>
        <td class="muted">${when(g.created_at)}</td>
      </tr>`;
    })
    .join("");

  return c.html(
    page(
      "Guests",
      `${nav("guests")}
      <div class="card"><h2>Try it without an account</h2>
        <p class="muted">Guests get a few builds on one game, then are asked to make a family account to save and share it. Limits are set in backend/wrangler.jsonc (GUEST_BUILD_LIMIT, GUEST_IP_DAILY_LIMIT, GUEST_GLOBAL_DAILY_LIMIT).</p>
        <div class="table-wrap"><table>
          <tr><th></th>${rows.map((r) => `<th>${r.label}</th>`).join("")}</tr>
          ${statRow("Guest games started", (r) => String(r.started))}
          ${statRow("…with at least one build", (r) => String(r.built))}
          ${statRow("AI builds by guests", (r) => String(r.builds))}
          ${statRow("Guest AI cost (est.)", (r) => `$${r.cost.toFixed(2)}`)}
          ${statRow("Saved to a family account", (r) => String(r.claimed))}
          ${statRow("Conversion (saved ÷ built)", (r) => `${r.conversion}%`)}
          ${statRow("Blocked: used all free tries", (r) => String(r.blockedGuest))}
          ${statRow("Blocked: per-network daily limit", (r) => String(r.blockedIp))}
          ${statRow("Blocked: site-wide daily limit", (r) => String(r.blockedGlobal))}
          ${statRow("Failed guest builds", (r) => String(r.failures))}
        </table></div>
      </div>
      <div class="card"><h2>Recent guest games</h2>
        <div class="table-wrap"><table>
          <tr><th>Game</th><th>What they asked for</th><th>Builds</th><th>Saved by</th><th>Started</th></tr>
          ${recentRows || '<tr><td colspan="5" class="muted">No guest games yet.</td></tr>'}
        </table></div>
      </div>`,
    ),
  );
});

// A guest game, sandboxed exactly like /play.
guests.get("/guests/:id/preview", async (c) => {
  const row = await c.env.DB.prepare("SELECT html FROM guest_projects WHERE id = ?").bind(c.req.param("id")).first<{ html: string }>();
  return new Response(row?.html || "<p>No code.</p>", {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": PREVIEW_CSP,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
});
