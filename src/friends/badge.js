// Loaded by the header only when someone is signed in. The Friends dot comes
// from the server's own record of what this account hasn't viewed yet (a
// puzzle to play, a result to watch, guest results included), so it is the
// same on every device and needs no push notifications.
import { supabase, call } from "./client";

/**
 * For the signed-in account, or null when nobody is:
 *   unread   puzzles to play and results to watch not opened yet (the dot)
 *   waiting  friends' puzzles waiting to be played (one at most per friend)
 *   results  finished results of my puzzles I haven't watched yet
 */
export async function fetchActivity() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const inbox = await call("get_friends_inbox");
  const friends = Array.isArray(inbox?.friends) ? inbox.friends : [];
  return {
    unread: inbox?.unread || 0,
    waiting: friends.filter((f) => f.incoming).length,
    results: friends.filter((f) => f.unseen_result).length,
    me: inbox?.me || null,
  };
}

export async function fetchUnread() {
  return (await fetchActivity())?.unread || 0;
}
