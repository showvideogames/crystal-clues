// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { loadWordBank, wordBankPagePath, WordBankLoadError, WORD_PAGE_SIZE } from "./wordBank.js";

// A stand-in for the database: ids ascend, and like the hosted API it never
// returns more than `cap` rows per request however many were asked for.
function fakeServer(words, { cap = 1000, failOnCall = null } = {}) {
  const rows = words.map((word, i) => ({ id: i + 1, word }));
  const calls = [];
  const fetchPage = async ({ afterId, limit }) => {
    calls.push({ afterId, limit });
    if (failOnCall === calls.length) throw new Error("network down");
    return rows.filter((r) => afterId == null || r.id > afterId).slice(0, Math.min(limit, cap));
  };
  return { rows, calls, fetchPage };
}
// Distinct words that sort in the same order they are numbered (W0000, W0001, ...).
const makeWords = (n) => Array.from({ length: n }, (_, i) => `W${String(i).padStart(4, "0")}`);

describe("loading the whole word bank", () => {
  it("returns every word of a bank larger than the server's 1000-row page limit", async () => {
    const words = makeWords(2500);
    const srv = fakeServer(words);
    const loaded = await loadWordBank(srv.fetchPage);
    expect(loaded).toHaveLength(2500);
    expect(new Set(loaded).size).toBe(2500);
    expect(loaded).toEqual(words);                       // alphabetical
    expect(loaded).toContain("W2499");                   // the last word is there
  });

  it("includes the words that sort after a 1000-word cut-off", async () => {
    const words = [...makeWords(1000).map((w) => `A${w}`), ...["TRASH", "TREE", "ZOO"].map((w) => `Z${w}`)];
    const loaded = await loadWordBank(fakeServer(words).fetchPage);
    expect(loaded).toHaveLength(1003);
    expect(loaded).toContain("ZZOO");
  });

  it("walks in pages: the first from the start, each next one after the last id seen", async () => {
    const srv = fakeServer(makeWords(2500));
    await loadWordBank(srv.fetchPage);
    expect(srv.calls).toEqual([
      { afterId: null, limit: WORD_PAGE_SIZE },
      { afterId: 1000, limit: WORD_PAGE_SIZE },
      { afterId: 2000, limit: WORD_PAGE_SIZE },
      { afterId: 2500, limit: WORD_PAGE_SIZE },   // the empty page that proves the end
    ]);
  });

  it.each([0, 1, 999, 1000, 1001, 2000, 2001])("loads a bank of exactly %i words", async (n) => {
    const words = makeWords(n);
    expect(await loadWordBank(fakeServer(words).fetchPage)).toEqual(words);
  });

  it("does not take a short page for the end when the server caps below the page size", async () => {
    const words = makeWords(1081);
    const srv = fakeServer(words, { cap: 300 });
    expect(await loadWordBank(srv.fetchPage)).toEqual(words);
    expect(srv.calls.length).toBe(5);                    // 300+300+300+181, then empty
  });

  it("loses no word when a word is added or removed while the pages load", async () => {
    const words = makeWords(2500);
    const srv = fakeServer(words);
    const real = srv.fetchPage;
    let call = 0;
    const fetchPage = async (args) => {
      call++;
      if (call === 2) {
        srv.rows.splice(5, 1);                           // an early word is deleted (shifts offsets, not ids)
        srv.rows.push({ id: 9999, word: "ZZ-NEW" });     // a new word arrives
      }
      return real(args);
    };
    const loaded = await loadWordBank(fetchPage);
    const missing = words.filter((w, i) => i !== 5 && !loaded.includes(w));
    expect(missing).toEqual([]);
    expect(loaded).toContain("ZZ-NEW");
  });

  it("fails the whole load when a later page fails, and returns no partial bank", async () => {
    const srv = fakeServer(makeWords(2500), { failOnCall: 2 });
    const err = await loadWordBank(srv.fetchPage).catch((e) => e);
    expect(err).toBeInstanceOf(WordBankLoadError);
    expect(err.loaded).toBe(1000);                       // what had been read (and is discarded)
    expect(err.message).toMatch(/stopped loading after 1000 words/);
    expect(err.message).toMatch(/network down/);
  });

  it("fails when the first page fails", async () => {
    const err = await loadWordBank(fakeServer(makeWords(10), { failOnCall: 1 }).fetchPage).catch((e) => e);
    expect(err).toBeInstanceOf(WordBankLoadError);
    expect(err.loaded).toBe(0);
  });

  it("fails on an answer that is not a list, rather than treating it as an empty bank", async () => {
    for (const bad of [null, undefined, { message: "JWT expired" }]) {
      await expect(loadWordBank(async () => bad)).rejects.toBeInstanceOf(WordBankLoadError);
    }
  });

  it("fails on rows that don't advance, instead of looping forever", async () => {
    const same = async () => [{ id: 1, word: "A" }];
    await expect(loadWordBank(same)).rejects.toThrow(/out of order or malformed/);
    await expect(loadWordBank(async () => [{ id: 2, word: "B" }, { id: 1, word: "A" }])).rejects.toBeInstanceOf(WordBankLoadError);
    await expect(loadWordBank(async () => [{ id: 1 }])).rejects.toBeInstanceOf(WordBankLoadError);
  });

  it("asks for pages in id order with a keyset filter", () => {
    expect(wordBankPagePath()).toBe("wordbank?select=id,word&order=id.asc&limit=1000");
    expect(wordBankPagePath({ afterId: 1000, limit: 500 })).toBe("wordbank?select=id,word&order=id.asc&limit=500&id=gt.1000");
  });
});

// The friend creator reads the bank through its own client (supabase-js), not
// App.jsx's REST helper. Both must page.
describe("the friend creator's word bank read", () => {
  async function clientWith(words, { cap = 1000, failOnCall = null } = {}) {
    vi.resetModules();
    const srv = fakeServer(words, { cap, failOnCall });
    const from = vi.fn(() => {
      const state = { afterId: null, limit: null };
      const q = {
        select: () => q,
        order: () => q,
        limit: (n) => { state.limit = n; return q; },
        gt: (_col, v) => { state.afterId = v; return q; },
        then: (res, rej) => srv.fetchPage(state).then((data) => ({ data, error: null }), (e) => ({ data: null, error: { message: e.message } })).then(res, rej),
      };
      return q;
    });
    vi.doMock("../account/supabaseClient", () => ({ supabase: { from, rpc: vi.fn() } }));
    const { api } = await import("../friends/client.js");
    return { api, from, srv };
  }

  it("returns all words of a bank larger than the page limit", async () => {
    const words = makeWords(2500);
    const { api, from } = await clientWith(words);
    expect(await api.wordBank()).toEqual(words);
    expect(from).toHaveBeenCalledWith("wordbank");
  });

  it("rejects, with no partial bank, when a page fails", async () => {
    const { api } = await clientWith(makeWords(2500), { failOnCall: 2 });
    // (a fresh module graph, so match by name rather than by class identity)
    await expect(api.wordBank()).rejects.toMatchObject({ name: "WordBankLoadError", loaded: 1000 });
  });
});
