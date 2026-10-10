// Loaded by the header only when someone is signed in: how many friend
// puzzles are waiting to be played or results waiting to be seen.
import { supabase, call } from "./client";

export async function fetchUnread() {
  if (!supabase) return 0;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return 0;
  const inbox = await call("get_friends_inbox");
  return inbox?.unread || 0;
}
