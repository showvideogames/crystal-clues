// Shapes a server puzzle view for the game board. The answer is included
// only when the server sent it (the creator, or after the puzzle is over).
//   whole: show the creator's complete puzzle — all four answer cards and all
//          three bonus cards — instead of just the cards dealt for the attempt.
export function friendPuzzleForGame(view, { whole = false } = {}) {
  const useWhole = whole && view.authored_cards;
  const cards = useWhole ? view.authored_cards : view.cards;
  const answerIds = view.solution?.slotCards || [];
  const extraCards = useWhole
    ? view.bonus_cards.map((b) => b.card_id)
    : (view.card_order || Object.keys(cards || {})).filter((id) => !answerIds.includes(id));
  return {
    id:`friend-${view.id}`,
    title:view.title || `${view.creator_name}'s puzzle`,
    date:(view.sent_at || new Date().toISOString()).slice(0,10),
    clues:view.clues,
    cards,
    difficulty:view.difficulty || "hardcore",
    solution:view.solution ? { ...view.solution, extraCards } : null,
  };
}
