// Clue-collision rules for Unlimited, in one place.
//
// This is NOT the board generator. It is the small set of pure predicates the generator will
// call, written and tested now so the rules are settled before any generator exists.
//
// The rules, in full:
//   1. A clue MAY be identical to another word in the overall word pool.
//   2. A clue MAY be identical to a different visible card word in the current puzzle.
//      That is intentional: it can give the player useful deduction or misdirection.
//      SUPERSEDED for random Unlimited boards (owner rule, 2026-10-22; generator 3): there a
//      displayed hint never equals any of the 28 board words (targets and decoys; case and
//      whitespace folded only). It is enforced at selection time by src/unlimited/generate.js
//      (hintWordClashes), never by deleting a clue from the master data, so the data-level
//      predicate below is unchanged. The Daily game is not affected.
//   3. A clue must NOT be identical to either of the two target words it points toward.
//   4. Within one generated puzzle, the same clue text cannot be used at two clue positions.
//   5. The same clue text MAY exist in any number of pair records in the master database.
//   6. Cross-pair repetition is resolved at selection time by choosing a conflict-free
//      combination, never by deleting a clue from the master data.
//   7. There is no global clue-frequency ceiling in the master data.

/** Rule 3. The only collision that disqualifies a clue from its own pair record. */
export function collidesWithOwnTargets(clueText, wordA, wordB) {
  return clueText === wordA || clueText === wordB;
}

/**
 * Rules 1 and 2, stated positively so the intent survives refactoring: a clue is never
 * disqualified from the master data for matching some other word in the pool or on a board.
 * (Random Unlimited boards avoid such a clash at selection time instead; see rule 2.)
 */
export function collidesWithOtherBoardWord() {
  return false;
}

/**
 * Rule 4. `selection` is one entry per clue position in a single puzzle:
 *   { position, text, wordA, wordB }
 * Returns { ok, errors }. Errors are strings, ordered by position.
 */
export function validatePuzzleClueSelection(selection) {
  const errors = [];
  const seen = new Map();

  selection.forEach((s, i) => {
    const where = s.position ?? i;

    if (typeof s.text !== "string" || !s.text.trim()) {
      errors.push(`position ${where}: empty clue text`);
      return;
    }
    if (collidesWithOwnTargets(s.text, s.wordA, s.wordB)) {
      errors.push(`position ${where}: clue "${s.text}" is one of its own two target words`);
    }
    if (seen.has(s.text)) {
      errors.push(
        `position ${where}: clue "${s.text}" is already used at position ${seen.get(s.text)}; ` +
          `selected clue text must be unique across every clue position in a puzzle`
      );
    } else {
      seen.set(s.text, where);
    }
  });

  return { ok: errors.length === 0, errors };
}

/** Rule 4, as a boolean, for callers that only need the answer. */
export function puzzleClueSelectionIsValid(selection) {
  return validatePuzzleClueSelection(selection).ok;
}

/** Rules 5 to 7. Reuse across pair records is reported, never enforced. */
export function clueTextFrequency(pairs) {
  const freq = new Map();
  for (const p of pairs) for (const c of p.clues) freq.set(c.text, (freq.get(c.text) || 0) + 1);
  return freq;
}
