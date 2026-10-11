// The avatars a player can pick, and how a name becomes the ball's letter.
// "ball" is the default: a crystal ball wearing the first letter of the
// player's name. The server stores only a real choice (dog … star); no
// choice means the ball. The pictures are in public/avatars (see
// tools/build-avatars.mjs); the letter is drawn by the app, never baked in.

export const AVATARS = [
  { key: "ball", label: "Crystal ball" },
  { key: "dog",  label: "Dog" },
  { key: "cat",  label: "Cat" },
  { key: "fox",  label: "Fox" },
  { key: "owl",  label: "Owl" },
  { key: "frog", label: "Frog" },
  { key: "star", label: "Star" },
];

const KEYS = new Set(AVATARS.map((a) => a.key));

/** A stored or unknown value → a key we can draw ("ball" when there's no valid choice). */
export function avatarKey(value) {
  return typeof value === "string" && KEYS.has(value) ? value : "ball";
}

export const avatarSrc = (key) => `/avatars/${avatarKey(key)}.webp`;

/** First letter (or digit) of the name, upper-cased; "" when there is none. */
export function avatarInitial(name) {
  const m = String(name ?? "").match(/[\p{L}\p{N}]/u);
  return m ? m[0].toLocaleUpperCase() : "";
}

/** What the ball shows for a name, or nothing for the animals. */
export function avatarLetter(key, name) {
  return avatarKey(key) === "ball" ? avatarInitial(name) : "";
}
