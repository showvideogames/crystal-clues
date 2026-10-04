// The one Supabase client for everything that needs a session (accounts,
// plays, admin writes). Content reads in App.jsx keep using plain fetch with
// the publishable key, exactly as before; they only borrow the session's
// access token (getAccessToken) so an admin's writes carry their identity.
//
// Settings copied from Rainbow (src/integrations/supabase/client.ts):
//   flowType 'pkce'            the sign-in code is exchanged on /auth/callback, never from a URL hash
//   detectSessionInUrl false   only the callback page turns a code into a session
//   storageKey 'cv-auth'       this game's session, this browser; never shared with another game
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIGURED, SUPABASE_KEY, SUPABASE_URL } from "../game/config";

export const AUTH_STORAGE_KEY = "cv-auth";

/** null in offline mode (no project configured). Every caller checks ACCOUNTS_ENABLED first. */
export const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storageKey: AUTH_STORAGE_KEY,
        persistSession: true,
        autoRefreshToken: true,
        flowType: "pkce",
        detectSessionInUrl: false,
      },
    })
  : null;

/** The current session's access token, or null (guest / offline). */
export async function getAccessToken() {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}
