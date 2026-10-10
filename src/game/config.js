// Runtime configuration. Everything that names a Supabase project or the
// shared sign-in service comes from the environment (decision D5): there is
// no hosted-project default in code, so pointing Cluevoyance at another
// project is a configuration change, never a code change.
//
//   VITE_SUPABASE_URL              the Supabase project (required for the daily game)
//   VITE_SUPABASE_PUBLISHABLE_KEY  its publishable (anon) key, public by design
//   VITE_PLATFORM_DISCOVERY_URL    the shared sign-in's OpenID discovery document;
//                                  empty = accounts OFF (guest-only build)
//   VITE_ACCOUNTS_ENABLED          "false" hides every sign-in surface (emergency switch)
//
// See .env.example and docs/CONFIG-INVENTORY.md.

const trim = (v) => (typeof v === "string" ? v.trim() : "");

export const SUPABASE_URL = trim(import.meta.env.VITE_SUPABASE_URL);
export const SUPABASE_KEY = trim(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);

/** True when the app has a Supabase project to talk to. */
export const SUPABASE_CONFIGURED = SUPABASE_URL !== "" && SUPABASE_KEY !== "";

/**
 * Explicit offline mode: no project configured. The daily game runs on its
 * built-in sample puzzle, the archive and admin show "not configured", and
 * accounts are off. This is a deliberate local-development state, announced
 * once in the console, never a silent fallback to a hosted project.
 */
export const OFFLINE_MODE = !SUPABASE_CONFIGURED;

export const PLATFORM_DISCOVERY_URL = trim(import.meta.env.VITE_PLATFORM_DISCOVERY_URL);

/** Accounts are on when a project and the sign-in service are configured and the switch is not explicitly off. */
export const ACCOUNTS_ENABLED =
  SUPABASE_CONFIGURED && PLATFORM_DISCOVERY_URL !== "" && trim(import.meta.env.VITE_ACCOUNTS_ENABLED ?? "true") !== "false";

export const NOT_CONFIGURED_MESSAGE =
  "Supabase is not configured (VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY). Cluevoyance is running in offline guest-only mode with its sample puzzle.";

let announced = false;
/** Say once, in the console, that the app is in offline mode. */
export function announceConfiguration() {
  if (announced) return;
  announced = true;
  if (OFFLINE_MODE) {
    console.warn(`[cluevoyance] ${NOT_CONFIGURED_MESSAGE}`);
  } else if (!ACCOUNTS_ENABLED) {
    console.info("[cluevoyance] accounts are off (no VITE_PLATFORM_DISCOVERY_URL, or VITE_ACCOUNTS_ENABLED=false); guest-only build.");
  }
}

/**
 * Friends (asynchronous puzzle exchange). Off unless the build sets
 * VITE_FRIENDS=1, and it needs shared accounts: every Friends action belongs
 * to a signed-in Cluevoyance account, so a guest-only build never shows it.
 */
export const FRIENDS_ENABLED = ACCOUNTS_ENABLED && trim(import.meta.env.VITE_FRIENDS) === "1";

/** Web-push public key; empty = notifications not set up (the in-app inbox still works). */
export const VAPID_PUBLIC_KEY = trim(import.meta.env.VITE_VAPID_PUBLIC_KEY);
