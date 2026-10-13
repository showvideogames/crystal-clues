// Loading the whole word bank.
//
// The database answers at most `max_rows` (1000) rows per request and says
// nothing when it cuts a longer answer short, so a single request silently
// returns only the first 1000 words. The bank is therefore read page by page,
// in `id` order (unique and never reused, so the order is stable), each page
// starting after the last id of the one before. That keeps the walk complete
// even while someone adds or deletes a word mid-load, which offset paging
// would not. A page ends the walk only when it comes back empty: a short page
// is not proof of the end, because the server may be capping lower than asked.
//
// Any page that fails fails the whole load. A partial bank is never returned,
// so nothing downstream can mistake it for the real one.

export const WORD_PAGE_SIZE = 1000;
// A guard, not a limit anyone should meet: 500 pages of 1000 is half a million words.
const MAX_PAGES = 500;

export class WordBankLoadError extends Error {
  constructor(message, { loaded = 0, pages = 0, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "WordBankLoadError";
    this.loaded = loaded;   // words read before the failure (discarded)
    this.pages = pages;
  }
}

// PostgREST path for one page, after `afterId` (null for the first page).
export function wordBankPagePath({ afterId = null, limit = WORD_PAGE_SIZE } = {}) {
  const after = afterId == null ? "" : `&id=gt.${encodeURIComponent(afterId)}`;
  return `wordbank?select=id,word&order=id.asc&limit=${limit}${after}`;
}

// fetchPage({ afterId, limit }) -> Promise<[{ id, word }]>, ordered by id.
// Resolves to every word, alphabetical. Rejects with WordBankLoadError if any
// page fails or comes back malformed.
export async function loadWordBank(fetchPage, { pageSize = WORD_PAGE_SIZE } = {}) {
  const words = [];
  let afterId = null;
  for (let pages = 0; pages < MAX_PAGES; pages++) {
    let rows;
    try {
      rows = await fetchPage({ afterId, limit: pageSize });
    } catch (cause) {
      throw new WordBankLoadError(
        `The word bank stopped loading after ${words.length} words (page ${pages + 1} failed: ${cause?.message || cause}).`,
        { loaded: words.length, pages, cause });
    }
    if (!Array.isArray(rows)) {
      throw new WordBankLoadError(`The word bank stopped loading after ${words.length} words (page ${pages + 1} was not a list).`,
        { loaded: words.length, pages });
    }
    if (rows.length === 0) return words.sort((a, b) => a.localeCompare(b));
    let last = afterId;
    for (const r of rows) {
      if (typeof r?.word !== "string" || r.id == null || (last != null && !(r.id > last))) {
        throw new WordBankLoadError(`The word bank stopped loading after ${words.length} words (page ${pages + 1} was out of order or malformed).`,
          { loaded: words.length, pages });
      }
      last = r.id;
      words.push(r.word);
    }
    afterId = last;
  }
  throw new WordBankLoadError(`The word bank stopped loading after ${words.length} words (more than ${MAX_PAGES} pages).`,
    { loaded: words.length, pages: MAX_PAGES });
}
