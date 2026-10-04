// The app's view of the account: who is signed in, whether this browser's
// guest history is waiting for a decision, whether the account may edit
// content, and the actions the header and the prompt call.
// Availability-first: when accounts are off or the server is unreachable,
// the game simply stays a guest.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ACCOUNTS_ENABLED } from "../game/config";
import { supabase } from "./supabaseClient";
import {
  deleteMyAccount,
  ensureAccount,
  getCurrentAccount,
  signInWithPlatform,
  signOutOfCluevoyance,
  subscribeToCurrentAccount,
} from "./platformSignIn";
import { guestHistoryExists } from "./localHistory";
import { flushUnsynced, importGuestHistory, loadPlays, startFresh as startFreshLocal } from "./plays";

export function useCurrentAccount() {
  return useSyncExternalStore(subscribeToCurrentAccount, getCurrentAccount, () => null);
}

async function checkAdmin() {
  if (!supabase) return false;
  try {
    const { data, error } = await supabase.rpc("is_cluevoyance_admin");
    return !error && data === true;
  } catch {
    return false;
  }
}

/**
 * status: 'off' (accounts disabled) | 'checking' | 'guest' | 'signed_in'
 * isAdmin: the signed-in account may write official content (the database enforces it regardless)
 * importPending: the "Bring your progress with you?" prompt should be shown
 * historyVersion: bumps whenever the account's plays changed, so the app re-reads stats
 * message: a sentence for the player (sign-in unavailable, not an account, ...), or null
 */
export function useAccount() {
  const account = useCurrentAccount();
  const [status, setStatus] = useState(ACCOUNTS_ENABLED ? "checking" : "off");
  const [isAdmin, setIsAdmin] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [message, setMessage] = useState(null);
  const bump = useCallback(() => setHistoryVersion((v) => v + 1), []);

  // After the account is known: replay unsynced plays, refresh the cache, and
  // ask about guest history exactly once per sign-in on this browser.
  const settle = useCallback(async (acct) => {
    if (!acct) {
      setStatus("guest");
      setIsAdmin(false);
      setImportPending(false);
      bump();
      return;
    }
    await flushUnsynced(acct.user_id).catch(() => 0);
    await loadPlays(acct.user_id).catch(() => null);
    setIsAdmin(await checkAdmin());
    setImportPending(guestHistoryExists());
    setStatus("signed_in");
    bump();
  }, [bump]);

  useEffect(() => {
    if (!ACCOUNTS_ENABLED || !supabase) return undefined;
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      if (!data?.session) {
        setStatus("guest");
        return;
      }
      const result = await ensureAccount();
      if (!alive) return;
      if (result.ok) await settle(result.account);
      else {
        // not_platform_linked has already signed out locally; 'unavailable'
        // keeps the session for a retry on the next load. Either way the app
        // is a guest for now.
        if (result.reason === "not_platform_linked") setMessage(result.message);
        setStatus("guest");
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && alive) settle(null);
    });
    return () => {
      alive = false;
      sub?.subscription?.unsubscribe();
    };
  }, [settle]);

  const signIn = useCallback(async () => {
    setMessage(null);
    const err = await signInWithPlatform();
    if (err) setMessage(err);
  }, []);

  const signOut = useCallback(async () => {
    await signOutOfCluevoyance();
    await settle(null);
  }, [settle]);

  const deleteAccount = useCallback(async () => {
    const res = await deleteMyAccount();
    if (!res.ok) {
      setMessage(res.message || "Could not delete the account.");
      return false;
    }
    await settle(null);
    return true;
  }, [settle]);

  const addMyProgress = useCallback(async () => {
    const acct = getCurrentAccount();
    if (!acct) return;
    const res = await importGuestHistory(acct.user_id);
    if (!res.ok) {
      setMessage(res.message || "Could not add your progress. Please try again.");
      return;
    }
    setImportPending(false);
    bump();
  }, [bump]);

  const startFresh = useCallback(() => {
    startFreshLocal();
    setImportPending(false);
    bump();
  }, [bump]);

  const dismissMessage = useCallback(() => setMessage(null), []);

  return {
    account, status, isAdmin, importPending, historyVersion, message,
    signIn, signOut, deleteAccount, addMyProgress, startFresh, dismissMessage,
  };
}
