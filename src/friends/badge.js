// Loaded by the header only when someone is signed in. The Friends dot comes
// from the server's own record of what this account hasn't viewed yet (a
// puzzle to play, a result to watch, guest results included), so it is the
// same on every device and needs no push notifications.
import { supabase, call } from "./client";

/** { unread, me } for the signed-in account, or null when nobody is. */
export async function fetchActivity() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const inbox = await call("get_friends_inbox");
  return { unread: inbox?.unread || 0, me: inbox?.me || null };
}

export async function fetchUnread() {
  return (await fetchActivity())?.unread || 0;
}
