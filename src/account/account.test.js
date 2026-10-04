// Unit tests for the account modules (jsdom; no network). Run: npm run test:unit
//
// U1 configuration portability   U2 sign-in reachability   U3 callback handling
// U4 provider tokens forgotten   U5 ensureAccount outcomes U6 guest history + import decision
// U7 derived stats/completions   U8 sign-out               U9 plays sync / import / start fresh
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── a controllable fake Supabase client ──
const fake = {
  signInWithOAuth: vi.fn(async () => ({ error: null })),
  exchangeCodeForSession: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => {
    localStorage.removeItem("cv-auth");
    return { error: null };
  }),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  rpc: vi.fn(async () => ({ data: null, error: null })),
  rows: [],
  fromError: null,
};
vi.mock("./supabaseClient", () => ({
  AUTH_STORAGE_KEY: "cv-auth",
  supabase: {
    auth: {
      signInWithOAuth: (...a) => fake.signInWithOAuth(...a),
      exchangeCodeForSession: (...a) => fake.exchangeCodeForSession(...a),
      signOut: (...a) => fake.signOut(...a),
      getSession: (...a) => fake.getSession(...a),
    },
    rpc: (...a) => fake.rpc(...a),
    from: () => ({ select: () => ({ eq: async () => ({ data: fake.rows, error: fake.fromError }) }) }),
  },
  getAccessToken: async () => null,
}));

const GUEST = {
  completions: {
    1700000000000: { solved: true, livesUsed: 0, difficulty: "standard", solvedAt: "2026-10-01T10:00:00.000Z" },
    1700000000001: { solved: true, livesUsed: 2, difficulty: "expert", solvedAt: "2026-10-02T10:00:00.000Z" },
    1700000000002: { solved: false, livesUsed: 3, difficulty: "standard", solvedAt: "2026-10-03T10:00:00.000Z" },
    "not-a-number": { solved: true, livesUsed: 1, difficulty: "easy", solvedAt: "2026-10-03T10:00:00.000Z" },
  },
  stats: { currentStreak: 2, maxStreak: 5, lastSolvedDate: "2026-10-02", totalPlayed: 7, totalWon: 2, livesUsedDist: { 0: 1, 1: 0, 2: 1, X: 5 }, difficultyWins: { easy: 0, standard: 1, expert: 1, hardcore: 0 } },
};
function seedGuest() {
  localStorage.setItem("clover_completions", JSON.stringify(GUEST.completions));
  localStorage.setItem("clover_stats", JSON.stringify(GUEST.stats));
  localStorage.setItem("clover_progress_1700000000003", JSON.stringify({ lives: 2 }));
  localStorage.setItem("clover_difficulty", JSON.stringify("expert"));
  localStorage.setItem("clover_tutorial_seen", "true");
}
const snapshot = () => Object.fromEntries(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)]));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fake.signInWithOAuth.mockClear();
  fake.exchangeCodeForSession.mockClear();
  fake.signOut.mockClear();
  fake.rpc.mockReset();
  fake.rpc.mockImplementation(async () => ({ data: null, error: null }));
  fake.rows = [];
  fake.fromError = null;
  window.history.replaceState(null, "", "/");
});

// ── U1 configuration ──
describe("U1 configuration is environment-driven, with explicit offline mode", () => {
  async function load(env) {
    vi.resetModules();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const mod = await import("../game/config");
    vi.unstubAllEnvs();
    vi.resetModules(); // later imports see the baseline env again
    return mod;
  }
  it("no project configured → offline guest-only mode, accounts off", async () => {
    const c = await load({ VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "", VITE_PLATFORM_DISCOVERY_URL: "https://x.test/.well-known/openid-configuration" });
    expect(c.OFFLINE_MODE).toBe(true);
    expect(c.ACCOUNTS_ENABLED).toBe(false);
    expect(c.SUPABASE_URL).toBe("");
  });
  it("project configured, no discovery URL → accounts off", async () => {
    const c = await load({ VITE_SUPABASE_URL: "https://p.test", VITE_SUPABASE_PUBLISHABLE_KEY: "k", VITE_PLATFORM_DISCOVERY_URL: "" });
    expect(c.OFFLINE_MODE).toBe(false);
    expect(c.ACCOUNTS_ENABLED).toBe(false);
  });
  it("everything configured → accounts on; the emergency switch turns them off", async () => {
    const on = await load({ VITE_SUPABASE_URL: "https://p.test", VITE_SUPABASE_PUBLISHABLE_KEY: "k", VITE_PLATFORM_DISCOVERY_URL: "https://x.test/.well-known/openid-configuration" });
    expect(on.ACCOUNTS_ENABLED).toBe(true);
    const off = await load({ VITE_SUPABASE_URL: "https://p.test", VITE_SUPABASE_PUBLISHABLE_KEY: "k", VITE_PLATFORM_DISCOVERY_URL: "https://x.test/.well-known/openid-configuration", VITE_ACCOUNTS_ENABLED: "false" });
    expect(off.ACCOUNTS_ENABLED).toBe(false);
  });
  it("the source names no hosted project, key, or sign-in domain (portability)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const files = [];
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jsx?|css)$/.test(e.name) && !e.name.endsWith(".test.js")) files.push(p); } };
    walk(dir);
    const forbidden = [/supabase\.co/, /sb_publishable_/, /authkit\.app/, /workos\.com/, /qszqparrqyhegfznyaby/];
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      for (const re of forbidden) expect(text, `${path.relative(dir, f)} must not match ${re}`).not.toMatch(re);
    }
    const migrations = path.resolve(dir, "..", "supabase", "migrations");
    for (const m of fs.readdirSync(migrations)) {
      const text = fs.readFileSync(path.join(migrations, m), "utf8");
      for (const re of forbidden) expect(text, `${m} must not match ${re}`).not.toMatch(re);
    }
  });
});

// ── U2 sign-in ──
describe("U2 signInWithPlatform", () => {
  it("unreachable sign-in service → a sentence, no navigation, guest data untouched", async () => {
    seedGuest();
    const before = snapshot();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("blocked"); }));
    const { signInWithPlatform, HUB_UNAVAILABLE } = await import("./platformSignIn");
    expect(await signInWithPlatform()).toBe(HUB_UNAVAILABLE);
    expect(fake.signInWithOAuth).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
    vi.unstubAllGlobals();
  });
  it("reachable → leaves for the provider through custom:platform with the exact callback and scopes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
    const { signInWithPlatform } = await import("./platformSignIn");
    window.history.replaceState(null, "", "/?x=1");
    expect(await signInWithPlatform()).toBeNull();
    expect(fake.signInWithOAuth).toHaveBeenCalledWith({
      provider: "custom:platform",
      options: { redirectTo: `${window.location.origin}/auth/callback`, scopes: "openid email profile" },
    });
    expect(sessionStorage.getItem("cv-auth-return-to")).toBe("/?x=1");
    vi.unstubAllGlobals();
  });
});

// ── U3 callback ──
describe("U3 handleCallback", () => {
  it("code → exchanged, stripped from the address bar, provider tokens forgotten", async () => {
    const { handleCallback } = await import("./platformSignIn");
    localStorage.setItem("cv-auth", JSON.stringify({ access_token: "a", provider_token: "hub", provider_refresh_token: "hubr" }));
    sessionStorage.setItem("cv-auth-return-to", "/archive");
    window.history.replaceState(null, "", "/auth/callback?code=abc123");
    const r = await handleCallback();
    expect(r).toEqual({ ok: true, returnTo: "/archive" });
    expect(fake.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(window.location.search).toBe("");
    expect(JSON.parse(localStorage.getItem("cv-auth"))).toEqual({ access_token: "a" });
  });
  it("provider error → message, nothing exchanged, guest history preserved", async () => {
    seedGuest();
    const before = snapshot();
    const { handleCallback } = await import("./platformSignIn");
    window.history.replaceState(null, "", "/auth/callback?error=access_denied&error_description=Nope");
    const r = await handleCallback();
    expect(r.ok).toBe(false);
    expect(r.errorMessage).toBe("Nope");
    expect(fake.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
    expect(window.location.search).toBe("");
  });
  it("no code → missing_code; exchange failure → exchange_failed; guest history preserved", async () => {
    seedGuest();
    const before = snapshot();
    const { handleCallback } = await import("./platformSignIn");
    window.history.replaceState(null, "", "/auth/callback");
    expect((await handleCallback()).errorCode).toBe("missing_code");
    fake.exchangeCodeForSession.mockImplementationOnce(async () => ({ error: { message: "bad code" } }));
    window.history.replaceState(null, "", "/auth/callback?code=zzz");
    const r = await handleCallback();
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("exchange_failed");
    expect(snapshot()).toEqual(before);
  });
  it("a return path on another origin becomes the home page", async () => {
    const { handleCallback } = await import("./platformSignIn");
    sessionStorage.setItem("cv-auth-return-to", "https://evil.test/x");
    window.history.replaceState(null, "", "/auth/callback?code=abc");
    expect((await handleCallback()).returnTo).toBe("/");
    sessionStorage.setItem("cv-auth-return-to", "//evil.test/x");
    window.history.replaceState(null, "", "/auth/callback?code=abc");
    expect((await handleCallback()).returnTo).toBe("/");
  });
});

// ── U4 ──
it("U4 forgetHubTokens removes only the provider tokens", async () => {
  const { forgetHubTokens } = await import("./platformSignIn");
  localStorage.setItem("cv-auth", JSON.stringify({ access_token: "a", refresh_token: "r", provider_token: "p" }));
  forgetHubTokens();
  expect(JSON.parse(localStorage.getItem("cv-auth"))).toEqual({ access_token: "a", refresh_token: "r" });
  localStorage.setItem("cv-auth", "not json");
  expect(() => forgetHubTokens()).not.toThrow();
});

// ── U5 ──
describe("U5 ensureAccount", () => {
  it("ok → the account is published with the server's email", async () => {
    const { ensureAccount, getCurrentAccount } = await import("./platformSignIn");
    fake.rpc.mockResolvedValueOnce({ data: [{ outcome: "ok", user_id: "u1", global_user_id: "user_X", email: "new@x.test", created_at: "2026-10-04" }], error: null });
    const r = await ensureAccount();
    expect(r.ok).toBe(true);
    expect(getCurrentAccount()).toEqual({ user_id: "u1", global_user_id: "user_X", email: "new@x.test", created_at: "2026-10-04" });
    expect(fake.rpc).toHaveBeenCalledWith("ensure_account");
  });
  it("not_platform_linked → local sign-out, no account, the message", async () => {
    const { ensureAccount, getCurrentAccount, NOT_CLUEVOYANCE_ACCOUNT } = await import("./platformSignIn");
    fake.rpc.mockResolvedValueOnce({ data: [{ outcome: "not_platform_linked" }], error: null });
    const r = await ensureAccount();
    expect(r).toMatchObject({ ok: false, reason: "not_platform_linked", message: NOT_CLUEVOYANCE_ACCOUNT });
    expect(fake.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(getCurrentAccount()).toBeNull();
  });
  it("server unreachable → unavailable, session KEPT (no sign-out), retryable", async () => {
    const { ensureAccount } = await import("./platformSignIn");
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: "fetch failed" } });
    const r = await ensureAccount();
    expect(r).toMatchObject({ ok: false, reason: "unavailable" });
    expect(fake.signOut).not.toHaveBeenCalled();
  });
});

// ── U6 ──
describe("U6 guest history and the import decision", () => {
  it("guestHistoryExists / summary / toPlays only use real wins with numeric ids", async () => {
    const h = await import("./localHistory");
    expect(h.guestHistoryExists()).toBe(false);
    seedGuest();
    expect(h.guestHistoryExists()).toBe(true);
    expect(h.guestHistorySummary()).toEqual({ wins: 3, played: 7, maxStreak: 5 });
    const plays = h.guestCompletionsToPlays();
    expect(plays).toEqual([
      { puzzle_id: 1700000000000, solved: true, lives_used: 0, difficulty: "standard", finished_at: "2026-10-01T10:00:00.000Z" },
      { puzzle_id: 1700000000001, solved: true, lives_used: 2, difficulty: "expert", finished_at: "2026-10-02T10:00:00.000Z" },
    ]);
  });
  it("stats-only history (losses) still counts as history to ask about", async () => {
    const h = await import("./localHistory");
    localStorage.setItem("clover_stats", JSON.stringify({ totalPlayed: 3, totalWon: 0 }));
    expect(h.guestHistoryExists()).toBe(true);
    expect(h.guestCompletionsToPlays()).toEqual([]);
  });
  it("clearGuestHistory removes stats and completions, keeps progress/difficulty/tutorial", async () => {
    const h = await import("./localHistory");
    seedGuest();
    h.clearGuestHistory();
    expect(localStorage.getItem("clover_completions")).toBeNull();
    expect(localStorage.getItem("clover_stats")).toBeNull();
    expect(localStorage.getItem("clover_progress_1700000000003")).not.toBeNull();
    expect(localStorage.getItem("clover_difficulty")).toBe('"expert"');
    expect(localStorage.getItem("clover_tutorial_seen")).toBe("true");
  });
  it("corrupt storage is treated as empty", async () => {
    const h = await import("./localHistory");
    localStorage.setItem("clover_completions", "{bad json");
    localStorage.setItem("clover_stats", "[]");
    expect(h.guestHistoryExists()).toBe(false);
    expect(h.readGuestCompletions()).toEqual({});
  });
});

// ── U7 ──
describe("U7 stats derived from plays match the guest counters' shape and rules", () => {
  const play = (id, date, solved, lives = 0, difficulty = "standard") => ({ puzzle_id: id, puzzle_date: date, solved, lives_used: lives, difficulty, finished_at: `${date}T12:00:00Z` });
  it("totals, distribution (capped at 2), difficulty wins, losses as X", async () => {
    const { deriveStats } = await import("./plays");
    const s = deriveStats([play(1, "2026-10-01", true, 0, "easy"), play(2, "2026-10-02", true, 3, "expert"), play(3, "2026-10-03", false, 3)], "2026-10-03");
    expect(s).toEqual({
      currentStreak: 2, maxStreak: 2, lastSolvedDate: "2026-10-02", totalPlayed: 3, totalWon: 2,
      livesUsedDist: { 0: 1, 1: 0, 2: 1, X: 1 }, difficultyWins: { easy: 1, standard: 0, expert: 1, hardcore: 0 },
    });
  });
  it("streak: consecutive puzzle dates ending today or yesterday; a gap resets; older runs count for maxStreak", async () => {
    const { deriveStats } = await import("./plays");
    const plays = [play(1, "2026-09-20", true), play(2, "2026-09-21", true), play(3, "2026-09-22", true), play(4, "2026-10-03", true), play(5, "2026-10-04", true)];
    expect(deriveStats(plays, "2026-10-04").currentStreak).toBe(2);
    expect(deriveStats(plays, "2026-10-05").currentStreak).toBe(2);
    expect(deriveStats(plays, "2026-10-06").currentStreak).toBe(0);
    expect(deriveStats(plays, "2026-10-04").maxStreak).toBe(3);
    expect(deriveStats([], "2026-10-04")).toMatchObject({ currentStreak: 0, maxStreak: 0, lastSolvedDate: null, totalPlayed: 0 });
  });
  it("completions in the guest shape, wins only", async () => {
    const { deriveCompletions } = await import("./plays");
    expect(deriveCompletions([play(7, "2026-10-01", true, 1, "expert"), play(8, "2026-10-02", false)])).toEqual({
      7: { solved: true, livesUsed: 1, difficulty: "expert", solvedAt: "2026-10-01T12:00:00Z" },
    });
  });
});

// ── U8 ──
it("U8 sign-out is local: clears the session, the account cache and the guest keys; the provider is never called", async () => {
  const { signOutOfCluevoyance, getCurrentAccount } = await import("./platformSignIn");
  seedGuest();
  localStorage.setItem("cv-auth", "{}");
  localStorage.setItem("cv_account_plays", JSON.stringify({ user_id: "u1", plays: [], unsynced: [] }));
  await signOutOfCluevoyance();
  expect(fake.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(localStorage.getItem("cv-auth")).toBeNull();
  expect(localStorage.getItem("cv_account_plays")).toBeNull();
  expect(localStorage.getItem("clover_completions")).toBeNull();
  expect(localStorage.getItem("clover_stats")).toBeNull();
  expect(localStorage.getItem("clover_difficulty")).toBe('"expert"');
  expect(getCurrentAccount()).toBeNull();
});

// ── U9 ──
describe("U9 plays: record, unsynced replay, import once, start fresh", () => {
  it("recordPlay updates the cache first; a failed server call is kept as unsynced and replayed later", async () => {
    const { recordPlay, flushUnsynced } = await import("./plays");
    const { readAccountCache } = await import("./localHistory");
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    expect(await recordPlay("u1", { puzzleId: 5, puzzleDate: "2026-10-04", solved: true, livesUsed: 1, difficulty: "standard" })).toBe("unsynced");
    let c = readAccountCache("u1");
    expect(c.plays).toHaveLength(1);
    expect(c.unsynced).toHaveLength(1);
    fake.rpc.mockResolvedValueOnce({ data: [{ outcome: "ok" }], error: null });
    expect(await flushUnsynced("u1")).toBe(1);
    expect(fake.rpc).toHaveBeenLastCalledWith("record_play", { _puzzle_id: 5, _solved: true, _lives_used: 1, _difficulty: "standard" });
    c = readAccountCache("u1");
    expect(c.unsynced).toHaveLength(0);
  });
  it("a win in the cache is never downgraded by a later loss", async () => {
    const { recordPlay } = await import("./plays");
    const { readAccountCache } = await import("./localHistory");
    fake.rpc.mockResolvedValue({ data: [{ outcome: "ok" }], error: null });
    await recordPlay("u1", { puzzleId: 5, puzzleDate: "2026-10-04", solved: true, livesUsed: 0, difficulty: "standard" });
    await recordPlay("u1", { puzzleId: 5, puzzleDate: "2026-10-04", solved: false, livesUsed: 3, difficulty: "standard" });
    expect(readAccountCache("u1").plays).toEqual([expect.objectContaining({ puzzle_id: 5, solved: true, lives_used: 0 })]);
  });
  it("Add my progress: uploads exactly the guest wins, then clears the guest keys; a second call has nothing to send", async () => {
    const { importGuestHistory } = await import("./plays");
    seedGuest();
    fake.rpc.mockResolvedValueOnce({ data: [{ outcome: "ok", imported: 2, skipped: 0 }], error: null });
    const r = await importGuestHistory("u1");
    expect(r).toEqual({ ok: true, imported: 2, skipped: 0 });
    const [fn, args] = fake.rpc.mock.calls[0];
    expect(fn).toBe("import_plays");
    expect(args._plays.map((p) => p.puzzle_id)).toEqual([1700000000000, 1700000000001]);
    expect(localStorage.getItem("clover_completions")).toBeNull();
    expect(localStorage.getItem("clover_stats")).toBeNull();
    fake.rpc.mockClear();
    const again = await importGuestHistory("u1");
    expect(again).toEqual({ ok: true, imported: 0, skipped: 0 });
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("a failed import keeps the guest history for another try", async () => {
    const { importGuestHistory } = await import("./plays");
    seedGuest();
    fake.rpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    expect((await importGuestHistory("u1")).ok).toBe(false);
    expect(localStorage.getItem("clover_completions")).not.toBeNull();
  });
  it("Start fresh: nothing uploaded, guest keys cleared", async () => {
    const { startFresh } = await import("./plays");
    seedGuest();
    startFresh();
    expect(fake.rpc).not.toHaveBeenCalled();
    expect(localStorage.getItem("clover_completions")).toBeNull();
  });
});

// ── historyStore: the App.jsx switch ──
describe("historyStore routes guests to the guest code and accounts to plays", () => {
  it("guest: the guest functions are used verbatim", async () => {
    const store = await import("./historyStore");
    const { getCurrentAccount } = await import("./platformSignIn");
    expect(getCurrentAccount()).toBeNull();
    const guestLoad = vi.fn(() => ({ totalPlayed: 42 }));
    expect(store.loadStatsFor(guestLoad)).toEqual({ totalPlayed: 42 });
    const guestUpdate = vi.fn(() => "updated");
    expect(store.recordFinishFor({ won: true, livesUsed: 0, difficulty: "standard", puzzle: { id: 1 } }, guestUpdate)).toBe("updated");
    const guestSave = vi.fn();
    store.saveCompletionFor(guestSave);
    expect(guestSave).toHaveBeenCalled();
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("signed in: stats derive from the account's plays and a finish is recorded", async () => {
    const store = await import("./historyStore");
    const { ensureAccount } = await import("./platformSignIn");
    fake.rpc.mockResolvedValueOnce({ data: [{ outcome: "ok", user_id: "u9", global_user_id: "user_Y", email: null, created_at: "x" }], error: null });
    await ensureAccount();
    fake.rpc.mockResolvedValue({ data: [{ outcome: "ok" }], error: null });
    const guestUpdate = vi.fn();
    const s = store.recordFinishFor({ won: true, livesUsed: 1, difficulty: "expert", puzzle: { id: 77, date: "2026-10-04" } }, guestUpdate);
    expect(guestUpdate).not.toHaveBeenCalled();
    expect(s.totalWon).toBe(1);
    expect(s.difficultyWins.expert).toBe(1);
    expect(store.loadCompletionsFor(() => "guest")).toEqual({ 77: expect.objectContaining({ solved: true, livesUsed: 1 }) });
    const guestSave = vi.fn();
    store.saveCompletionFor(guestSave);
    expect(guestSave).not.toHaveBeenCalled();
  });
});
