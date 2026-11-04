const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no l/o/0/1 — easy to read aloud

export function randomId(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

// "Space Cat Jumper!" -> "space-cat-jumper-k7d2". The random tail keeps two
// kids' "my-game" from colliding and makes a link unguessable before it is
// published (the play route still checks status).
export function slugFor(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `${base || "project"}-${randomId(4)}`;
}
