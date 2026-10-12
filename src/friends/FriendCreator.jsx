import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./client";
import { dealCardsFromBank, checkBoard, vw } from "../game/shared";
import { Icon, Spinner, PageHead, InfoTip } from "./ui.jsx";

// A player's own puzzle for one friend, built on the simplified Create
// Puzzle board: deal cards, tap any clue or card word to edit it in a
// horizontal editor above the keyboard (the board updates as you type),
// turn or drag cards, save a draft, send. The board itself is the live
// preview. It's always one complete puzzle — four answer cards and three
// bonus cards; the friend picks the difficulty (how many bonus cards
// they're dealt) when they start. It writes only this player's private
// draft; the server checks it again and freezes it when it's sent.

const CLUE_MAX = 20;
const WORD_MAX = 18;
const newId = () => `c${Math.random().toString(36).slice(2, 9)}`;

// Board geometry. Slots 0–3 are the answer: top-left, top-right,
// bottom-right, bottom-left. Clue i sits on side i (top, right, bottom,
// left) and links the outer word of each card on that side, read left to
// right or top to bottom: [slot, edge as shown].
const SIDES = ["top", "right", "bottom", "left"];
const CLUE_LINKS = [[[0, 0], [1, 0]], [[1, 1], [2, 1]], [[3, 2], [2, 2]], [[0, 3], [3, 3]]];
const SLOT_NAMES = ["top-left card", "top-right card", "bottom-right card", "bottom-left card"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Unsaved edits are mirrored locally so a refresh or a closed tab doesn't
// lose them. They are restored only on top of the same server version they
// started from, so they can never overwrite a draft saved elsewhere.
const backupKey = (friendshipId) => `clover_friend_draft_backup_${friendshipId}`;
const readBackup = (friendshipId) => {
  try { return JSON.parse(localStorage.getItem(backupKey(friendshipId)) || "null"); } catch { return null; }
};
const writeBackup = (friendshipId, value) => {
  try {
    if(value) localStorage.setItem(backupKey(friendshipId), JSON.stringify(value));
    else localStorage.removeItem(backupKey(friendshipId));
  } catch {
    // storage unavailable — the server draft is still there
  }
};

function blankBoard(){
  const cards = {};
  const slots = [];
  for(let i=0;i<7;i++){
    const id = newId();
    cards[id] = { id, words:["","","",""] };
    slots.push({ cardId:id, orientation:0 });
  }
  return { clues:["","","",""], cards, slots };
}

// Typing keeps spaces as they're typed (so "ICE CREAM" can be written);
// what's checked and saved is trimmed.
const tidy = (b) => ({
  ...b,
  clues:b.clues.map(c=>(c || "").trim()),
  cards:Object.fromEntries(Object.entries(b.cards).map(([id, c])=>[id, { ...c, words:c.words.map(w=>(w || "").trim()) }])),
});

// How much of the bottom of the layout viewport the on-screen keyboard
// covers. iPhone keeps the layout viewport and shrinks the visual one;
// Android usually resizes both, and then this stays 0 (bottom:0 is
// already above the keyboard).
function keyboardInset(){
  const vv = window.visualViewport;
  return vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
}
function useKeyboardInset(){
  const [inset,setInset] = useState(keyboardInset);
  useEffect(()=>{
    const vv = window.visualViewport;
    if(!vv) return undefined;
    const update = ()=>setInset(keyboardInset());
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return ()=>{ vv.removeEventListener("resize", update); vv.removeEventListener("scroll", update); };
  },[]);
  return inset;
}

// The editor: one horizontal text field, what it connects to, and Done.
// Docked to the bottom of the visible screen, just above the keyboard.
// Nothing is lost if the keyboard closes: every keystroke is already on the board.
function EditSheet({ editKey, title, context, value, maxLength, placeholder, inputLabel, onChange, onDone, onSize }) {
  const inputRef = useRef(null);
  const sheetRef = useRef(null);
  const inset = useKeyboardInset();
  // Focus as part of the tap that opened it, so phones raise the keyboard,
  // without letting the browser scroll the page to the field.
  useLayoutEffect(()=>{
    const el = inputRef.current;
    if(!el) return;
    el.focus({ preventScroll:true });
    const end = el.value.length;
    try { el.setSelectionRange(end, end); } catch { /* not a text field */ }
  },[editKey]);
  // Tell the page how much room to keep clear below its content.
  useLayoutEffect(()=>{
    const el = sheetRef.current;
    if(!el) return undefined;
    const report = ()=>onSize(el.offsetHeight + inset);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return ()=>ro.disconnect();
  },[inset, onSize]);
  return createPortal(
    <div ref={sheetRef} className="fr-sheet" style={{ bottom:inset }} role="dialog" aria-label={title}>
      <div className="fr-sheet-inner">
        <div className="fr-sheet-head">
          <span className="fr-sheet-title">{title}</span>
          {context}
        </div>
        <form className="fr-sheet-row" onSubmit={e=>{ e.preventDefault(); onDone(); }}>
          <input ref={inputRef} className="fr-input fr-sheet-input" value={value} maxLength={maxLength}
            placeholder={placeholder} aria-label={inputLabel}
            autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="done"
            onChange={e=>onChange(e.target.value)}
            onKeyDown={e=>{ if(e.key === "Escape"){ e.preventDefault(); onDone(); } }}/>
          <button type="submit" className="fr-btn primary fr-sheet-done">Done</button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// friend.share: a puzzle sent as a link to anyone, with or without an account
// — no friendship yet (friendship_id null); "Get link" instead of Send, and
// onShared gets the link. notice: one line shown under the heading.
export default function FriendCreator({ kit, friend, notice, onBack, onSent, onShared }) {
  const { AdminPreviewCard, DragGhost } = kit;
  const share = !!friend.share;
  const [label,setLabel] = useState("");          // who a link is for; only the sender sees it
  const name = share ? (label.trim() || "they") : friend.friend_name;
  const backupId = friend.friendship_id ?? "new";
  const [board,setBoard]           = useState(null);
  const [title,setTitle]           = useState("");
  const [draft,setDraft]           = useState(null);   // { id, version } once saved
  const [dirty,setDirty]           = useState(false);
  const [wordBank,setWordBank]     = useState([]);
  const [busy,setBusy]             = useState("");
  const [message,setMessage]       = useState(null);   // { kind, text, reload? }
  // What's being edited: { kind:"clue", index } or { kind:"word", cardId, raw } (raw = the card's own edge).
  const [editor,setEditor]         = useState(null);
  const [editText,setEditText]     = useState("");     // the field, exactly as typed
  const [sheetSpace,setSheetSpace] = useState(0);      // sheet + keyboard height, kept clear under the page
  const [howTo,setHowTo]           = useState(false);
  const [ghost,setGhost]     = useState(null);
  const [dragSrc,setDragSrc] = useState(null);
  const [dragOver,setDragOver] = useState(null);
  const slotRefs = useRef({});
  const dragRef  = useRef(null);
  const wrapRef  = useRef(null);

  const load = useCallback(async ()=>{
    setMessage(null);
    try {
      const [d, bank] = await Promise.all([api.getDraft(friend.friendship_id), api.wordBank().catch(()=>[])]);
      setWordBank(bank);
      if(d){
        setBoard(d.board); setTitle(d.title || "");
        setDraft({ id:d.id, version:d.version });
      } else {
        setBoard(blankBoard()); setTitle(""); setDraft(null);
      }
      setDirty(false);
      const backup = readBackup(backupId);
      if(backup?.board && backup.baseVersion === (d?.version ?? null)){
        setBoard(backup.board); setTitle(backup.title || "");
        setDirty(true);
        setMessage({ kind:"note", text:"We kept your unsaved changes from last time." });
      } else if(backup){
        writeBackup(backupId, null);
      }
    } catch(err){
      setMessage({ kind:"err", text:err.message });
    }
  },[friend.friendship_id, backupId]);

  useEffect(()=>{
    const t = setTimeout(load, 0);
    return ()=>clearTimeout(t);
  },[load]);

  useEffect(()=>{
    if(dirty && board) writeBackup(backupId, { board, title, baseVersion:draft?.version ?? null });
  },[dirty, board, title, draft, backupId]);

  const edit = (fn) => { setBoard(fn); setDirty(true); setMessage(null); };
  // All seven cards count: every bonus card must be finished, whatever
  // difficulty the friend picks later.
  const checks = useMemo(()=> board ? checkBoard({ ...tidy(board), cardCount:7 }) : null,[board]);

  // ── Editing ─────────────────────────────────────────────────────────
  const rotateCard = (cardId) => edit(b=>({ ...b,
    slots:b.slots.map(s=>s.cardId===cardId ? { ...s, orientation:(s.orientation+1)%4 } : s) }));
  const setWord = (cardId, raw, value) => edit(b=>({ ...b, cards:{ ...b.cards,
    [cardId]:{ ...b.cards[cardId], words:b.cards[cardId].words.map((w,i)=>i===raw ? value : w) } } }));
  const setClue = (i, value) => edit(b=>{ const clues=[...b.clues]; clues[i]=value; return { ...b, clues }; });

  // Leaving a field trims what was typed in it.
  const finish = (ed) => {
    if(ed?.kind === "clue") setBoard(b=>({ ...b, clues:b.clues.map((c,i)=>i===ed.index ? (c || "").trim() : c) }));
    if(ed?.kind === "word") setBoard(b=>{
      const c = b.cards[ed.cardId]; if(!c) return b;
      return { ...b, cards:{ ...b.cards, [ed.cardId]:{ ...c, words:c.words.map((w,i)=>i===ed.raw ? (w || "").trim() : w) } } };
    });
  };
  const openClue = (index) => {
    finish(editor);
    setEditor({ kind:"clue", index });
    setEditText(board.clues[index] || "");
  };
  const openWord = (cardId, shownEdge) => {
    finish(editor);
    const orientation = board.slots.find(s=>s.cardId===cardId)?.orientation || 0;
    const raw = (shownEdge - orientation + 4) % 4;   // store on the card's own (unturned) edge
    setEditor({ kind:"word", cardId, raw });
    setEditText(board.cards[cardId]?.words[raw] || "");
  };
  const closeEditor = () => { finish(editor); setEditor(null); setSheetSpace(0); };
  const typeInEditor = (v) => {
    setEditText(v);
    const value = v.toUpperCase();
    if(editor?.kind === "clue") setClue(editor.index, value.slice(0, CLUE_MAX));
    if(editor?.kind === "word") setWord(editor.cardId, editor.raw, value.slice(0, WORD_MAX));
  };

  // Keep what's being edited (a clue with the two cards it links, or a card)
  // in view above the sheet and keyboard: scroll only when it's actually
  // covered, and only as far as needed.
  useEffect(()=>{
    if(!editor || !sheetSpace) return undefined;
    const keep = ()=>{
      const wrap = wrapRef.current;
      const parts = wrap ? [...wrap.querySelectorAll('[data-editing="true"]')] : [];
      if(!wrap || !parts.length) return;
      const vv = window.visualViewport;
      const bottom = window.innerHeight - sheetSpace - 12;
      const top = Math.max(wrap.getBoundingClientRect().top, vv ? vv.offsetTop : 0) + 8;
      const rects = parts.map(p=>p.getBoundingClientRect());
      const r = { top:Math.min(...rects.map(x=>x.top)), bottom:Math.max(...rects.map(x=>x.bottom)) };
      if(r.bottom > bottom) wrap.scrollBy({ top:Math.min(r.bottom - bottom, r.top - top), behavior:"smooth" });
      else if(r.top < top) wrap.scrollBy({ top:r.top - top, behavior:"smooth" });
    };
    keep();
    // The keyboard can change the viewport without changing the sheet (Android).
    window.addEventListener("resize", keep);
    return ()=>window.removeEventListener("resize", keep);
  },[editor, sheetSpace]);

  const deal = () => {
    if(wordBank.length < 4){ setMessage({ kind:"err", text:"The word bank isn't available right now — type your own words on the cards." }); return; }
    const hasWords = Object.values(board.cards).some(c=>c.words.some(w=>w?.trim()));
    if(hasWords && !window.confirm("Dealing new cards will replace the words you've already entered. Continue?")) return;
    const dealt = dealCardsFromBank(wordBank, newId);
    setEditor(null); setSheetSpace(0);
    edit(()=>({ ...dealt, clues:["","","",""] }));
  };

  // Drag a card onto another slot to swap them (board ↔ bonus cards too).
  const getSlotAt = useCallback((x,y,exc)=>{
    for(let i=0;i<7;i++){
      if(i===exc) continue;
      const r=slotRefs.current[i]?.getBoundingClientRect();
      if(r && x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom) return i;
    }
    return -1;
  },[]);
  const handlePD = (e,si) => {
    const s=board.slots[si]; const card=s && board.cards[s.cardId]; if(!card) return;
    e.preventDefault(); e.stopPropagation();
    const sz=slotRefs.current[si]?.getBoundingClientRect().width || 100;
    dragRef.current={ x0:e.clientX, y0:e.clientY, moved:false };
    setDragSrc(si);
    const onMove=ev=>{
      ev.preventDefault();
      const dr=dragRef.current; if(!dr) return;
      if(!dr.moved && Math.hypot(ev.clientX-dr.x0, ev.clientY-dr.y0) > 8){
        dr.moved=true;
        setGhost({ x:ev.clientX, y:ev.clientY, card, orientation:s.orientation, sz });
      }
      if(dr.moved){
        setGhost(g=>g?{ ...g, x:ev.clientX, y:ev.clientY }:null);
        setDragOver(getSlotAt(ev.clientX, ev.clientY, si));
      }
    };
    const onUp=ev=>{
      document.removeEventListener("pointermove",onMove);
      document.removeEventListener("pointerup",onUp);
      const dr=dragRef.current; dragRef.current=null;
      setGhost(null); setDragSrc(null); setDragOver(null);
      if(!dr?.moved) return;
      const tgt=getSlotAt(ev.clientX, ev.clientY, si);
      if(tgt>=0) edit(b=>{ const ns=[...b.slots]; [ns[si],ns[tgt]]=[ns[tgt],ns[si]]; return { ...b, slots:ns }; });
    };
    document.addEventListener("pointermove",onMove,{ passive:false });
    document.addEventListener("pointerup",onUp);
  };

  // ── Saving and sending ──────────────────────────────────────────────
  const showError = (err) => setMessage({ kind:"err", text:err.message, reload:err.code === "draft_conflict" });

  const save = async () => {
    const clean = tidy(board);
    const saved = await api.saveDraft({
      friendshipId:friend.friendship_id, draftId:draft?.id, version:draft?.version,
      title, board:clean,
    });
    const next = { id:saved.id, version:saved.version };
    setDraft(next); setDirty(false);
    writeBackup(backupId, null);
    return next;
  };

  const handleSave = async () => {
    if(busy) return;
    setBusy("saving");
    try { await save(); setMessage({ kind:"ok", text:`Draft saved. Only you can see it until you send it.` }); }
    catch(err){ showError(err); }
    finally { setBusy(""); }
  };

  const handleSend = async () => {
    if(busy) return;
    if(!checks.canPublish){
      setMessage({ kind:"err", text:`Fill in ${checks.missingClues ? "every clue" : ""}${checks.missingClues && checks.blankEdges ? " and " : ""}${checks.blankEdges ? "every edge of all seven cards" : ""} before sending.` });
      return;
    }
    setBusy("sending");
    try {
      const d = (dirty || !draft) ? await save() : draft;
      if(share){
        onShared?.(await api.createShareLink(d.id, d.version, label.trim()));
        return;
      }
      await api.send(d.id, d.version);
      onSent?.();
    } catch(err){
      showError(err);
      setBusy("");
    }
  };

  const handleBack = async () => {
    if(dirty && board && !busy){
      // Keep their work: an unsaved board is saved as the draft on the way out.
      try { await save(); } catch { /* the draft stays as last saved */ }
    }
    onBack();
  };

  const renderCard = (si) => {
    const s=board.slots[si]; const card=s && board.cards[s.cardId];
    if(!card) return null;
    return (
      <AdminPreviewCard
        card={card} orientation={s.orientation}
        dim={dragSrc===si} dragSrc={dragSrc===si}
        selected={editor?.kind==="word" && editor.cardId===s.cardId}
        onPointerDown={e=>handlePD(e,si)}
        onRotate={()=>rotateCard(s.cardId)}
        editingWord={null}
        onStartEdit={(shownEdge)=>openWord(s.cardId, shownEdge)}
        onEditDraftChange={()=>{}} onCommitEdit={()=>{}} onCancelEdit={()=>{}}
      />
    );
  };
  const editingSlot = (si) => editor?.kind==="word" ? board.slots[si]?.cardId===editor.cardId
    : editor?.kind==="clue" && CLUE_LINKS[editor.index].some(([s])=>s===si);
  const boardSlot = (si) => (
    <div key={si} ref={el=>slotRefs.current[si]=el} className={`cslot${dragOver===si?" over":""}`}
      data-editing={editingSlot(si) ? "true" : undefined}>{renderCard(si)}</div>
  );

  // Clue pills: a tap opens the editor; nobody types into the turned pills themselves.
  const POS = ["top", "rgt", "bot", "lft"];
  const clueTab = (i) => {
    const text = board.clues[i];
    const active = editor?.kind==="clue" && editor.index===i;
    return (
      <button type="button" className={`ctab ${POS[i]} editable fr-clue-btn${active ? " active" : ""}`}
        data-editing={active ? "true" : undefined}
        aria-label={`Clue on the ${SIDES[i]}${text ? `: ${text}` : ", empty"}`} aria-pressed={active}
        onClick={()=>openClue(i)}>
        {text || <span className="ctab-ph">+ Add clue</span>}
      </button>
    );
  };
  const cluesWritten = board ? board.clues.filter(c=>c?.trim()).length : 0;
  // Nothing written yet: dealing cards is the first step, so it's the main button.
  const emptyBoard = !!board && board.slots.slice(0, 7).every(s=>(board.cards[s.cardId]?.words || []).every(w=>!w?.trim()));

  // What still stands between this board and Send, in one short line.
  const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
  let need = null;
  if(checks){
    const { missingClues:c, blankEdges:e, duplicateCount:d } = checks;
    need = emptyBoard ? "Deal cards, then write 4 clues"
      : c && e ? `${plural(c, "clue")} and ${plural(e, "card edge")} left to fill`
      : c ? `Write ${plural(c, "more clue")} to send`
      : e ? `Fill ${plural(e, "blank card edge")} to send`
      : d ? `Ready to send · ${plural(d, "repeated word")}`
      : "Ready to send";
  }

  // The editor's heading and what its field connects to.
  let sheet = null;
  if(board && editor){
    const wordAt = (slot, edge) => { const s = board.slots[slot]; return s ? vw(board.cards[s.cardId], s.orientation)[edge].trim() : ""; };
    const chip = (w) => <span className={`fr-sheet-chip${w ? "" : " blank"}`}>{w || "blank"}</span>;
    if(editor.kind === "clue"){
      const [[s1, e1], [s2, e2]] = CLUE_LINKS[editor.index];
      const a = wordAt(s1, e1), b = wordAt(s2, e2);
      sheet = {
        title:`${cap(SIDES[editor.index])} clue`,
        context:<span className="fr-sheet-links">Links {chip(a)}<span className="fr-sheet-plus" aria-hidden="true">+</span>{chip(b)}</span>,
        maxLength:CLUE_MAX, placeholder:"One clue for both words",
        inputLabel:`${cap(SIDES[editor.index])} clue, linking ${a || "a blank word"} and ${b || "a blank word"}`,
      };
    } else {
      const si = board.slots.findIndex(s=>s.cardId===editor.cardId);
      const shownEdge = (editor.raw + (board.slots[si]?.orientation || 0)) % 4;
      const where = si < 4 ? SLOT_NAMES[si] : `bonus card ${si - 3}`;
      const facesClue = si < 4 && CLUE_LINKS[shownEdge].some(([s, e])=>s===si && e===shownEdge);
      const clue = board.clues[shownEdge]?.trim();
      sheet = {
        title:`${cap(SIDES[shownEdge])} word · ${where}`,
        context: si >= 4 ? <span className="fr-sheet-links">Not on the board</span>
          : facesClue ? <span className="fr-sheet-links">Faces the {SIDES[shownEdge]} clue {chip(clue)}</span>
          : <span className="fr-sheet-links">Inside edge · faces no clue</span>,
        maxLength:WORD_MAX, placeholder:"Type a word",
        inputLabel:`${cap(SIDES[shownEdge])} word, ${where}`,
      };
    }
  }

  return (
    <div className="fr-wrap fr-creator" ref={wrapRef}>
      <div className="fr-page" style={{paddingBottom:sheetSpace ? sheetSpace + 16 : 0}}>
        <PageHead onBack={handleBack} title={share ? "Make a puzzle for a friend" : `Make one for ${name}`}
          sub={share ? "Tap a clue or a word to edit it. You'll get a link to text them; they can play right away, no account needed."
            : "Tap a clue or a word to edit it."}/>
        {notice && <div className="fr-msg ok" role="status">{notice}</div>}
        {!board ? (
          message ? <div className={`fr-msg ${message.kind}`}>{message.text} <button className="fr-link" onClick={load}>Try again</button></div>
                  : <p className="fr-sub">Loading…</p>
        ) : (
          <>
            <div className="fr-extras">
              {share && (
                <input className="fr-input" maxLength={24} value={label} placeholder="Who's it for? (only you see this)"
                  onChange={e=>setLabel(e.target.value)} aria-label="Who it's for"/>
              )}
              <input className="fr-input" maxLength={40} value={title} placeholder="Name it (optional)"
                onChange={e=>{ setTitle(e.target.value); setDirty(true); }} aria-label="Puzzle name"/>
            </div>

            <button className={`fr-btn ${emptyBoard ? "primary" : "secondary"} fr-deal`} onClick={deal} disabled={!!busy}>
              <span aria-hidden="true">🎲</span> Deal Random Cards
            </button>

            <div className="fr-board">
              <div className="fr-board-stage">
                {clueTab(0)}
                <div style={{display:"flex",alignItems:"center"}}>
                  {clueTab(3)}
                  <div className="csurface">
                    {boardSlot(0)}{boardSlot(1)}
                    {boardSlot(3)}{boardSlot(2)}
                  </div>
                  {clueTab(1)}
                </div>
                {clueTab(2)}
              </div>
              <div className="fr-howto">
                <button type="button" className="fr-howto-btn" aria-expanded={howTo} aria-controls="fr-howto-body"
                  onClick={()=>setHowTo(o=>!o)}>
                  <Icon name="help" size={18}/>How to make a puzzle
                </button>
                {howTo && (
                  <ul id="fr-howto-body" className="fr-howto-body">
                    <li>Write a clue on each side. Each clue links the two words facing it.</li>
                    <li>This board is the answer. Drag a card onto another to swap them; tap ↻ to turn one.</li>
                    <li>Tap any word to change it, or deal again for new cards.</li>
                    <li>Your draft is saved when you leave, and stays private until you send it.</li>
                  </ul>
                )}
              </div>
            </div>

            <section className="fr-surface fr-bonus-zone" aria-label="Bonus cards">
              <div className="fr-eyebrow">Bonus cards<InfoTip label="About bonus cards">
                <span className="fr-bonus-note">These three cards don’t belong on the board. {share ? "They choose" : `${name} chooses`} how many to play with.</span>
              </InfoTip></div>
              <div className="fr-decoys">
                {[4,5,6].map(si=>(
                  <div key={si} className="fr-decoy-col">
                    <div ref={el=>slotRefs.current[si]=el} className={`fr-decoy${dragOver===si?" over":""}`}
                      data-editing={editingSlot(si) ? "true" : undefined} aria-label={`Bonus card ${si - 3}`}>
                      {renderCard(si)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="fr-actionbar">
              {message && (
                <div className={`fr-msg ${message.kind}`} role={message.kind==="err" ? "alert" : "status"}>
                  {message.text} {message.reload && <button className="fr-link" onClick={load}>Reload</button>}
                </div>
              )}
              <div id="fr-need" className={`fr-need${checks.canPublish ? " ready" : ""}`} aria-live="polite">
                {checks.canPublish ? <Icon name="check" size={16}/> : (
                  <span className="fr-need-pips" role="img" aria-label={`${cluesWritten} of 4 clues written`}>
                    {board.clues.map((c, i)=><span key={i} className={c?.trim() ? "on" : ""}/>)}
                  </span>
                )}
                <span>{need}</span>
              </div>
              <div className="fr-row">
                <button className="fr-btn secondary" onClick={handleSave} disabled={!!busy} aria-busy={busy==="saving"}>
                  {busy==="saving" ? <><Spinner/>Saving</> : dirty || !draft ? "Save draft" : "Saved ✓"}
                </button>
                <button className="fr-btn primary" onClick={handleSend} disabled={!!busy || !checks.canPublish}
                  aria-describedby="fr-need" aria-busy={busy==="sending"}>
                  {busy==="sending" ? <><Spinner/>{share ? "Making link…" : "Sending…"}</> : share ? "Get link" : `Send puzzle to ${name}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {sheet && (
        <EditSheet editKey={editor.kind === "clue" ? `c${editor.index}` : `w${editor.cardId}${editor.raw}`}
          title={sheet.title} context={sheet.context} value={editText} maxLength={sheet.maxLength}
          placeholder={sheet.placeholder} inputLabel={sheet.inputLabel}
          onChange={typeInEditor} onDone={closeEditor} onSize={setSheetSpace}/>
      )}
      <DragGhost ghost={ghost}/>
    </div>
  );
}
