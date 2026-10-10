// Server calls for the friend exchange. Friends has no sign-in of its own:
// it uses the one shared Cluevoyance session (src/account/supabaseClient.js),
// and the server identifies the player with cluevoyance_uid(), so only a
// signed-in Cluevoyance account can take part.
import { supabase } from "../account/supabaseClient";

export { supabase };

// Server errors arrive as "code: message". Keep both, so screens can
// branch on the code and show the message as written.
export class FriendsError extends Error {
  constructor(raw) {
    const text = String(raw || "Something went wrong.");
    const m = text.match(/^([a-z_]+): (.*)$/s);
    super(m ? m[2] : friendlyNetworkMessage(text));
    this.code = m ? m[1] : "network";
  }
}

function friendlyNetworkMessage(text) {
  if (/fetch|network|Failed to/i.test(text)) return "Couldn't reach Cluevoyance. Check your connection and try again.";
  return text;
}

export async function call(fn, args = {}) {
  let res;
  try {
    res = await supabase.rpc(fn, args);
  } catch (err) {
    throw new FriendsError(err?.message);
  }
  if (res.error) throw new FriendsError(res.error.message);
  return res.data;
}

export const api = {
  profile: () => call("get_my_profile"),
  setName: (name) => call("set_display_name", { p_name: name }),
  setPrefs: (p) => call("update_notification_prefs", {
    p_new_puzzle: p.newPuzzle ?? null, p_results: p.results ?? null, p_reminders: p.reminders ?? null,
  }),
  inbox: () => call("get_friends_inbox"),
  history: (friendshipId) => call("list_friend_history", { p_friendship_id: friendshipId }),
  createInvite: () => call("create_friend_invite"),
  inviteInfo: (token) => call("get_friend_invite", { p_token: token }),
  acceptInvite: (token) => call("accept_friend_invite", { p_token: token }),
  getDraft: (friendshipId) => call("get_friend_draft", { p_friendship_id: friendshipId }),
  saveDraft: ({ friendshipId, draftId, version, title, board }) => call("save_friend_draft", {
    p_friendship_id: friendshipId, p_draft_id: draftId ?? null, p_version: version ?? null,
    p_title: title || "", p_board: board,
  }),
  discardDraft: (draftId) => call("discard_friend_draft", { p_draft_id: draftId }),
  send: (draftId, version) => call("send_friend_puzzle", { p_draft_id: draftId, p_version: version }),
  open: (puzzleId) => call("open_friend_puzzle", { p_puzzle_id: puzzleId }),
  chooseDifficulty: (puzzleId, difficulty) => call("choose_friend_difficulty", { p_puzzle_id: puzzleId, p_difficulty: difficulty }),
  guess: (puzzleId, { guessNo, board, extras, clues }) => call("submit_friend_guess", {
    p_puzzle_id: puzzleId, p_guess_no: guessNo,
    p_board: board.map((s) => ({ cardId: s.cardId, orientation: s.orientation })),
    p_extras: extras.filter(Boolean).map((s) => ({ cardId: s.cardId, orientation: s.orientation })),
    p_clues: clues,
  }),
  // Puzzles for someone new, shared by link (sender side).
  createShareLink: (draftId, version, label) => call("create_share_link", { p_draft_id: draftId, p_version: version, p_label: label || "" }),
  shareLinks: () => call("list_share_links"),
  stopShareLink: (puzzleId) => call("stop_share_link", { p_puzzle_id: puzzleId }),
  refreshShareLink: (puzzleId) => call("refresh_share_link", { p_puzzle_id: puzzleId }),
  // The person with the link: the link code plus this browser's guest key.
  openShared: (token, key) => call("open_shared_puzzle", { p_token: token, p_guest_key: key }),
  startShared: (token, key, difficulty) => call("start_shared_puzzle", { p_token: token, p_guest_key: key, p_difficulty: difficulty }),
  guessShared: (token, key, { guessNo, board, extras, clues }) => call("submit_shared_guess", {
    p_token: token, p_guest_key: key, p_guess_no: guessNo,
    p_board: board.map((s) => ({ cardId: s.cardId, orientation: s.orientation })),
    p_extras: extras.filter(Boolean).map((s) => ({ cardId: s.cardId, orientation: s.orientation })),
    p_clues: clues,
  }),
  claimShared: (token, key) => call("claim_shared_puzzle", { p_token: token, p_guest_key: key }),
  savePush: (sub) => call("save_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth }),
  deletePush: (endpoint) => call("delete_push_subscription", { p_endpoint: endpoint }),
  wordBank: async () => {
    const { data, error } = await supabase.from("wordbank").select("word").order("word");
    if (error) throw new FriendsError(error.message);
    return (data || []).map((r) => r.word);
  },
};
