#!/usr/bin/env node
// Deploy only from merged main (CLAUDE.md, docs/deploy-runbook.md — CEO,
// 2026-10-18). Every Worker's `predeploy` hook and
// backend/scripts/sync-assistant-knowledge.mjs --remote run this first. They
// all build from the WORKING TREE, so a deploy from a feature branch ships
// unmerged code that the next deploy from main silently reverts — which is how
// #297 went out before its review fixes.
//
// Refuses unless: HEAD is `main`, the tree is clean (untracked files included —
// an uncommitted new file still gets bundled), and HEAD equals origin/main after
// a fetch (a stale or locally-diverged main is a deploy nobody reviewed).
//
// Override, for emergencies only, INLINE on the one command (never `export` it,
// or every later deploy in that shell skips the check):
//   ALLOW_NON_MAIN_DEPLOY="<reason>" npm run deploy:backend
// The reason is printed so it lands in the terminal history. A plain
// `wrangler rollback` never goes through this hook and needs no override.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The repo this script lives in — git always runs here, never in whatever
// directory the operator happens to be in (the knowledge sync is run from the
// repo root by hand, and must not be judged by some other repo's state).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FETCH_TIMEOUT_MS = 15_000;

export function deployBlockers({ cwd = REPO_ROOT, fetch = true } = {}) {
  const git = (args, timeout) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      // Never sit on a credential prompt or a dead connection mid-incident.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeout,
    }).trim();
  let branch;
  try {
    branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch {
    return ["not a git checkout"];
  }
  const problems = [];
  if (branch !== "main") problems.push(`on branch "${branch}", not main`);
  if (git(["status", "--porcelain"]) !== "") problems.push("working tree has uncommitted or untracked changes (git status --short)");
  let fetched = !fetch;
  if (fetch) {
    try {
      git(["fetch", "--quiet", "origin", "main"], FETCH_TIMEOUT_MS);
      fetched = true;
    } catch {
      problems.push("could not fetch origin/main (offline or timed out), so it is not verified as up to date");
    }
  }
  // Compared even when the fetch failed, against the last-fetched origin/main,
  // so an operator using the override still learns if local main is stale.
  try {
    if (git(["rev-parse", "HEAD"]) !== git(["rev-parse", "origin/main"])) {
      problems.push(`HEAD is not origin/main${fetched ? "" : " (as last fetched)"} (run: git pull --ff-only)`);
    }
  } catch {
    problems.push("no origin/main to compare against");
  }
  return problems;
}

export function requireMain(what = "deploy", { cwd } = {}) {
  const override = process.env.ALLOW_NON_MAIN_DEPLOY?.trim();
  const problems = deployBlockers({ cwd });
  if (problems.length === 0) return;
  if (override) {
    console.error(`\nWARNING: ${what} OVERRIDE (ALLOW_NON_MAIN_DEPLOY): ${override}`);
    for (const p of problems) console.error(`   - ${p}`);
    console.error("");
    return;
  }
  console.error(`\nRefusing to ${what}: deploys run only from an up-to-date, clean main after the PR is merged.`);
  for (const p of problems) console.error(`   - ${p}`);
  console.error(`\n   git checkout main && git pull --ff-only && git status --short`);
  console.error(`   Emergency only, inline on one command: ALLOW_NON_MAIN_DEPLOY="<reason>" (see docs/deploy-runbook.md).\n`);
  process.exit(1);
}

// Run directly (the predeploy hooks). Compared by real path: Node resolves
// symlinks in import.meta.url but not in argv[1], so a plain comparison would
// silently skip the check whenever the repo is reached through a symlink.
function isMain() {
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}
if (isMain()) requireMain(process.argv[2] ?? "deploy");
