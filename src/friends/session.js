// What Friends keeps on this device, and how it is cleared when the
// signed-in account leaves (sign-out or deletion), so a shared phone or a
// switched account never inherits the last person's invite or notifications.
import { disablePush } from "./push";

// An invite opened before signing in is kept until it's accepted or dismissed,
// so it survives the round trip to the shared sign-in page.
const PENDING_INVITE = "cluevoyance-pending-invite";

export const readPendingInvite = () => {
  try {
    return localStorage.getItem(PENDING_INVITE);
  } catch {
    return null;
  }
};

export const writePendingInvite = (token) => {
  try {
    if (token) localStorage.setItem(PENDING_INVITE, token);
    else localStorage.removeItem(PENDING_INVITE);
  } catch {
    // storage unavailable (private mode): the invite stays in memory only
  }
};

/** Runs while the session still exists: the server forgets this device's push subscription. */
export async function leaveFriendsOnThisDevice() {
  writePendingInvite(null);
  await disablePush().catch(() => {});
}
