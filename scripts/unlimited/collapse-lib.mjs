// Joins two clauses about the same subject into one sentence:
//   "Harry Potter wears round glasses" + "Harry Potter studies at Hogwarts"
//   -> "Harry Potter wears round glasses and studies at Hogwarts"
// Applies only when both clauses open with the SAME subject: a run of
// capitalised words (a name like "Harry Potter", "Pixar", "Sherlock Holmes") or
// a single plural noun opening both clauses ("Seagulls"), never an article
// ("A", "An", "The") or a possessive ("Harry Potter's owl"), and the next word
// in both clauses is lower-case (so the whole subject was matched). Returns null
// when it does not apply.
const ARTICLES = new Set(["a", "an", "the"]);
export function collapse(first, second) {
  const wa = first.replace(/[.]$/, "").split(" "), wb = second.replace(/[.]$/, "").split(" ");
  let n = 0;
  while (n < wa.length && n < wb.length && wa[n] === wb[n] && /^[A-Z]/.test(wa[n])) n++;
  if (n === 0 || n >= wa.length || n >= wb.length) return null;
  if (ARTICLES.has(wa[0].toLowerCase())) return null;
  if (/['’]s$/.test(wa[n - 1])) return null;
  if (/^[A-Z]/.test(wa[n]) || /^[A-Z]/.test(wb[n])) return null;   // subject continues differently ("Harry Potter's" vs "Harry Potter")
  if (n === 1 && !/s$/.test(wa[0]) && !/^[A-Z][a-z]+[A-Z]|^[A-Z]{2,}/.test(wa[0]) && !/^[A-Z][a-z]+$/.test(wa[0])) return null;
  return `${wa.slice(0, n).join(" ")} ${wa.slice(n).join(" ")} and ${wb.slice(n).join(" ")}`;
}
