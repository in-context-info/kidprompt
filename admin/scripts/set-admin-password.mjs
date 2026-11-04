#!/usr/bin/env node
// Prompts for the admin password (hidden, asked twice) and writes a matching
// ADMIN_PASSWORD_HASH + ADMIN_PASSWORD_SALT pair into admin/.prod.secrets
// (or the file given as the first argument), replacing any earlier pair.
// Same PBKDF2 parameters as admin/src/lib/auth.ts. The password never
// appears on screen, in shell history, or in the file.
//
// Usage: node admin/scripts/set-admin-password.mjs [secrets-file]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".prod.secrets");

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    // A paste arrives as one chunk, so walk it character by character.
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        } else if (ch === "\u0003") {
          process.exit(1);
        } else if (ch === "\u007f") {
          value = value.slice(0, -1);
        } else {
          value += ch;
        }
      }
    };
    stdin.on("data", onData);
  });
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const password = await askHidden("New admin password: ");
if (password.length < 12) {
  console.error("Use at least 12 characters.");
  process.exit(1);
}
if ((await askHidden("Type it again: ")) !== password) {
  console.error("Those didn't match. Nothing was changed.");
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);

const kept = existsSync(file)
  ? readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => !/^ADMIN_PASSWORD_(HASH|SALT)=/.test(line))
      .join("\n")
      .replace(/\n*$/, "\n")
  : "";
writeFileSync(file, `${kept}ADMIN_PASSWORD_HASH=${toHex(bits)}\nADMIN_PASSWORD_SALT=${toHex(salt.buffer)}\n`, { mode: 0o600 });
console.log(`Saved the admin password hash and salt to ${file}`);
