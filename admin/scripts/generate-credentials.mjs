#!/usr/bin/env node
// Generates an ADMIN_PASSWORD_HASH + ADMIN_PASSWORD_SALT pair for the admin
// Worker's env vars, using the exact same PBKDF2 parameters as
// admin/src/lib/auth.ts (100,000 iterations, SHA-256, 256-bit output) so the
// Worker can verify it at login time.
//
// Usage: node admin/scripts/generate-credentials.mjs "your new password"

const password = process.argv[2];
if (!password) {
  console.error('Usage: node admin/scripts/generate-credentials.mjs "your new password"');
  process.exit(1);
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const saltBytes = crypto.getRandomValues(new Uint8Array(16));
const saltHex = toHex(saltBytes.buffer);

const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
  "deriveBits",
]);
const bits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" },
  keyMaterial,
  256,
);

console.log("ADMIN_PASSWORD_HASH=" + toHex(bits));
console.log("ADMIN_PASSWORD_SALT=" + saltHex);
console.log("");
console.log("Set these as Worker secrets from admin/ (production):");
console.log("  npx wrangler secret put ADMIN_PASSWORD_HASH");
console.log("  npx wrangler secret put ADMIN_PASSWORD_SALT");
console.log("Or add them to admin/.dev.vars for local dev.");
