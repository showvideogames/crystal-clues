// The app's view of the account: who is signed in, whether this browser's
// guest history is waiting for a decision, whether the account may edit
// content, and the actions the header and the prompt call.
// Availability-first: when accounts are off or the server is unreachable,
// the game simply stays a guest.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ACCOUNTS_ENABLED } from "../game/config";
import { supabase } from "./supabaseClient";
import {
  deleteMyAccount,
  ensureAccount,
  getCurrentAccount,
  observeAccountSession,
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
  const transition = useRef(0);
  const [status, setStatus] = useState(ACCOUNTS_ENABLED ? "checking" : "off");
  const [isAdmin, setIsAdmin] = useState(false);
  const [importPending, setImportPending] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [message, setMessage] = useState(null);
  const bump = useCallback(() => setHistoryVersion((v) => v + 1), []);

  // After the account is known: replay unsynced plays, refresh the cache, and
  // ask about guest history exactly once per sign-in on this browser.
  const settle = useCallback(async (acct) => {
    const ticket = transition.current;
    const current = () => ticket === transition.current && getCurrentAccount()?.user_id === acct?.user_id;
    if (!acct) {
      setStatus("guest");
      setIsAdmin(false);
      setImportPending(false);
      bump();
      return;
    }
    await flushUnsynced(acct.user_id).catch(() => 0);
    if (!current()) return;
    await loadPlays(acct.user_id).catch(() => null);
    if (!current()) return;
    const admin = await checkAdmin();
    if (!current()) return;
    setIsAdmin(admin);
    setImportPending(guestHistoryExists());
    setStatus("signed_in");
    bump();
  }, [bump]);

  useEffect(() => {
    if (!ACCOUNTS_ENABLED || !supabase) return undefined;
    let alive = true;
    let timer;
    const resolve = async (session, ticket) => {
      if (!alive || ticket !== transition.current) return;
      observeAccountSession(session);
      if (!session) {
        await settle(null);
        return;
      }
      try {
        const result = await ensureAccount();
        if (!alive || ticket !== transition.current) return;
        if (result.ok) await settle(result.account);
        else {
          if (result.reason === "not_platform_linked") setMessage(result.message);
          setStatus("guest");
        }
      } catch {
        if (alive && ticket === transition.current) setStatus("guest");
      }
    };
    const initial = ++transition.current;
    supabase.auth.getSession().then(({ data }) => resolve(data?.session, initial)).catch(() => {
      if (alive && initial === transition.current) setStatus("guest");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive || !["SIGNED_IN", "SIGNED_OUT"].includes(event)) return;
      if (event === "SIGNED_IN" && session?.user?.id === getCurrentAccount()?.user_id) return;
      const ticket = ++transition.current;
      observeAccountSession(session);
      setIsAdmin(false);
      setImportPending(false);
      setStatus(session ? "checking" : "guest");
      bump();
      clearTimeout(timer);
      // Supabase auth callbacks hold its session lock; perform RPCs afterwards.
      timer = setTimeout(() => { void resolve(session, ticket); }, 0);
    });
    return () => {
      alive = false;
      transition.current += 1;
      clearTimeout(timer);
      sub?.subscription?.unsubscribe();
    };
  }, [settle, bump]);

  const signIn = useCallback(async () => {
    setMessage(null);
    const err = await signInWithPlatform();
    if (err) setMessage(err);
  }, []);

  const signOut = useCallback(async () => {
    transition.current += 1;
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
