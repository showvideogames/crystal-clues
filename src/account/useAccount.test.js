import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";

const fake = vi.hoisted(() => ({
  listener: null,
  getSession: vi.fn(), rpc: vi.fn(), signOut: vi.fn(),
  flush: vi.fn(), load: vi.fn(),
}));
vi.mock("./supabaseClient", () => ({
  AUTH_STORAGE_KEY: "cv-auth",
  supabase: {
    auth: {
      getSession: fake.getSession, signOut: fake.signOut,
      onAuthStateChange: callback => {
        fake.listener = callback;
        return { data: { subscription: { unsubscribe() { fake.listener = null; } } } };
      },
    },
    rpc: fake.rpc,
  },
}));
vi.mock("./plays", () => ({
  flushUnsynced: fake.flush, loadPlays: fake.load,
  importGuestHistory: vi.fn(), startFresh: vi.fn(),
}));
import { useAccount } from "./useAccount";
import * as platform from "./platformSignIn";
let root, view;
const session = id => ({ user: { id } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function Probe() { const value = useAccount(); useEffect(() => { view = value; }); return null; }
async function event(name, value) {
  await act(async () => { fake.listener(name, value); await new Promise(r => setTimeout(r, 5)); });
}
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  platform.observeAccountSession?.(null);
  fake.getSession.mockReset().mockResolvedValue({ data: { session: session("a") } });
  fake.rpc.mockReset().mockImplementation(async name => ({ data: name === "ensure_account" ? [{ outcome: "ok", user_id: "a" }] : true, error: null }));
  fake.flush.mockReset().mockResolvedValue(0);
  fake.load.mockReset().mockResolvedValue({ plays: [] });
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root?.unmount()); delete globalThis.IS_REACT_ACT_ENVIRONMENT; });
it("clears account and admin state on a cross-tab sign-out", async () => {
  await act(async () => root.render(createElement(Probe)));
  expect(view.account.user_id).toBe("a");
  expect(view.isAdmin).toBe(true);
  await event("SIGNED_OUT", null);
  expect(view.account).toBeNull();
  expect(view.status).toBe("guest");
  expect(view.isAdmin).toBe(false);
});
it("does not restore signed-in status after a history load finishes after logout", async () => {
  const history = deferred();
  fake.load.mockReturnValueOnce(history.promise);
  await act(async () => root.render(createElement(Probe)));
  expect(fake.load).toHaveBeenCalledWith("a");
  await event("SIGNED_OUT", null);
  await act(async () => history.resolve({ plays: [] }));
  expect(view.status).toBe("guest");
  expect(view.account).toBeNull();
  expect(view.isAdmin).toBe(false);
});
it("adopts a different account signed in through another tab", async () => {
  await act(async () => root.render(createElement(Probe)));
  fake.rpc.mockImplementation(async name => ({ data: name === "ensure_account" ? [{ outcome: "ok", user_id: "b" }] : false, error: null }));
  await event("SIGNED_IN", session("b"));
  expect(view.account.user_id).toBe("b");
  expect(view.status).toBe("signed_in");
  expect(view.isAdmin).toBe(false);
  expect(fake.load).toHaveBeenLastCalledWith("b");
});
it("ignores a bootstrap session read superseded by sign-out", async () => {
  const old = deferred();
  fake.getSession.mockReturnValueOnce(old.promise);
  await act(async () => root.render(createElement(Probe)));
  await event("SIGNED_OUT", null);
  await act(async () => old.resolve({ data: { session: session("a") } }));
  expect(view.status).toBe("guest");
  expect(view.account).toBeNull();
  expect(fake.rpc).not.toHaveBeenCalled();
});
