import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, nudgePush } from "./client";
import { dealCardsFromBank, checkBoard } from "../game/shared";
import { Icon, Spinner, PageHead } from "./ui.jsx";

// A player's own puzzle for one friend, built on the simplified Create
// Puzzle board: deal cards, tap any clue or card-edge word to type it, turn
// or drag cards, preview, save a draft, send. It's always one complete
// puzzle — four answer cards and three bonus cards; the friend picks the
// difficulty (how many bonus cards they're dealt) when they start. It
// writes only this player's private draft; the server checks it again and
// freezes it when it's sent.

const CLUE_MAX = 20;
const WORD_MAX = 18;
const newId = () => `c${Math.random().toString(36).slice(2, 9)}`;

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

export default function FriendCreator({ kit, friend, onBack, onSent }) {
  const { AdminPreviewCard, EditableClueTab, DragGhost, GameView } = kit;
  const name = friend.friend_name;
  const [board,setBoard]           = useState(null);
  const [title,setTitle]           = useState("");
  const [draft,setDraft]           = useState(null);   // { id, version } once saved
  const [dirty,setDirty]           = useState(false);
  const [wordBank,setWordBank]     = useState([]);
  const [busy,setBusy]             = useState("");
  const [message,setMessage]       = useState(null);   // { kind, text, reload? }
  const [previewKey,setPreviewKey] = useState(0);      // 0 = not previewing
  const [inlineEdit,setInlineEdit] = useState(null);
  const [inlineDraft,setInlineDraft] = useState("");
  const [ghost,setGhost]     = useState(null);
  const [dragSrc,setDragSrc] = useState(null);
  const [dragOver,setDragOver] = useState(null);
  const slotRefs = useRef({});
  const dragRef  = useRef(null);

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
      const backup = readBackup(friend.friendship_id);
      if(backup?.board && backup.baseVersion === (d?.version ?? null)){
        setBoard(backup.board); setTitle(backup.title || "");
        setDirty(true);
        setMessage({ kind:"note", text:"We kept your unsaved changes from last time." });
      } else if(backup){
        writeBackup(friend.friendship_id, null);
      }
    } catch(err){
      setMessage({ kind:"err", text:err.message });
    }
  },[friend.friendship_id]);

  useEffect(()=>{
    const t = setTimeout(load, 0);
    return ()=>clearTimeout(t);
  },[load]);

  useEffect(()=>{
    if(dirty && board) writeBackup(friend.friendship_id, { board, title, baseVersion:draft?.version ?? null });
  },[dirty, board, title, draft, friend.friendship_id]);

  const edit = (fn) => { setBoard(fn); setDirty(true); setMessage(null); };
  // All seven cards count: every bonus card must be finished, whatever
  // difficulty the friend picks later.
  const checks = useMemo(()=> board ? checkBoard({ ...board, cardCount:7 }) : null,[board]);

  // ── Editing ─────────────────────────────────────────────────────────
  const updateClue = (i,val) => edit(b=>{
    const clues=[...b.clues]; clues[i]=val.toUpperCase().slice(0,CLUE_MAX); return { ...b, clues };
  });
  const rotateCard = (cardId) => edit(b=>({ ...b,
    slots:b.slots.map(s=>s.cardId===cardId ? { ...s, orientation:(s.orientation+1)%4 } : s) }));
  const startInlineEdit = (cardId, wordIndex, value) => { setInlineEdit({ cardId, wordIndex }); setInlineDraft(value || ""); };
  const cancelInlineEdit = () => { setInlineEdit(null); setInlineDraft(""); };
  const commitInlineEdit = () => {
    if(!inlineEdit) return;
    const { cardId, wordIndex } = inlineEdit;
    // wordIndex is the edge as shown; store it on the card's own (unturned) edge.
    const orientation = board.slots.find(s=>s.cardId===cardId)?.orientation || 0;
    const raw = (wordIndex - orientation + 4) % 4;
    const value = inlineDraft.toUpperCase().trim().slice(0,WORD_MAX);
    edit(b=>({ ...b, cards:{ ...b.cards,
      [cardId]:{ ...b.cards[cardId], words:b.cards[cardId].words.map((w,i)=>i===raw ? value : w) } } }));
    cancelInlineEdit();
  };

  const deal = () => {
    if(wordBank.length < 4){ setMessage({ kind:"err", text:"The word bank isn't available right now — type your own words on the cards." }); return; }
    const hasWords = Object.values(board.cards).some(c=>c.words.some(w=>w?.trim()));
    if(hasWords && !window.confirm("Dealing new cards will replace the words you've already entered. Continue?")) return;
    const dealt = dealCardsFromBank(wordBank, newId);
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
    const saved = await api.saveDraft({
      friendshipId:friend.friendship_id, draftId:draft?.id, version:draft?.version,
      title, board,
    });
    const next = { id:saved.id, version:saved.version };
    setDraft(next); setDirty(false);
    writeBackup(friend.friendship_id, null);
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
      await api.send(d.id, d.version);
      nudgePush();
      onSent();
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

  // ── Preview: the friend's view, playable, recording nothing ─────────
  // Shown with all three bonus cards (Hardcore), the fullest version of it.
  const previewPuzzle = useMemo(()=>{
    if(!board || !previewKey) return null;
    const used = board.slots.slice(0, 7);
    return {
      id:`preview-${previewKey}`, title:title || "Preview", status:"draft",
      date:new Date().toISOString().slice(0,10),
      clues:board.clues, difficulty:"hardcore",
      cards:Object.fromEntries(used.map(s=>[s.cardId, board.cards[s.cardId]])),
      solution:{
        slotCards:used.slice(0,4).map(s=>s.cardId),
        orientations:used.slice(0,4).map(s=>s.orientation),
        extraCards:used.slice(4).map(s=>s.cardId),
      },
    };
  },[board, previewKey, title]);

  if(previewPuzzle){
    return (
      <div className="fr-wrap" style={{display:"flex",flexDirection:"column"}}>
        <div className="fr-playbar">
          <button type="button" className="fr-back" onClick={()=>setPreviewKey(0)}><Icon name="back" size={18}/>Edit</button>
          <span className="grow"/>
          <span className="fr-chip">Preview <span>· all 3 bonus cards</span></span>
        </div>
        <div className="fr-game-shell">
          <GameView key={previewPuzzle.id} puzzle={previewPuzzle} difficulty="hardcore" forceFresh sandbox/>
        </div>
      </div>
    );
  }

  const renderCard = (si) => {
    const s=board.slots[si]; const card=s && board.cards[s.cardId];
    if(!card) return null;
    const editingWord = inlineEdit?.cardId===s.cardId ? inlineEdit.wordIndex : null;
    return (
      <AdminPreviewCard
        card={card} orientation={s.orientation}
        dim={dragSrc===si} dragSrc={dragSrc===si}
        onPointerDown={e=>handlePD(e,si)}
        onRotate={()=>rotateCard(s.cardId)}
        editingWord={editingWord}
        editDraft={editingWord!=null ? inlineDraft : ""}
        onStartEdit={(wordIndex, value)=>startInlineEdit(s.cardId, wordIndex, value)}
        onEditDraftChange={v=>setInlineDraft(v.slice(0,WORD_MAX))}
        onCommitEdit={commitInlineEdit}
        onCancelEdit={cancelInlineEdit}
      />
    );
  };
  const boardSlot = (si) => (
    <div key={si} ref={el=>slotRefs.current[si]=el} className={`cslot${dragOver===si?" over":""}`}>{renderCard(si)}</div>
  );

  const CLUE_SIDES = ["top", "right", "bottom", "left"];
  const cluePill = (i) => ({ placeholder:"+ Add clue", label:`Clue on the ${CLUE_SIDES[i]}` });
  const cluesWritten = board ? board.clues.filter(c=>c?.trim()).length : 0;

  // What still stands between this board and Send, in one short line.
  const plural = (n, one) => `${n} ${one}${n === 1 ? "" : "s"}`;
  let need = null;
  if(checks){
    const { missingClues:c, blankEdges:e, duplicateCount:d } = checks;
    need = c && e ? `${plural(c, "clue")} and ${plural(e, "card edge")} left to fill`
      : c ? `Write ${plural(c, "more clue")} to send`
      : e ? `Fill ${plural(e, "blank card edge")} to send`
      : d ? `Ready to send · ${plural(d, "repeated word")}`
      : "Ready to send";
  }

  return (
    <div className="fr-wrap">
      <div className="fr-page" style={{paddingBottom:0}}>
        <PageHead onBack={handleBack} title={`Make one for ${name}`} sub="Tap any clue or word to edit it."/>
        {!board ? (
          message ? <div className={`fr-msg ${message.kind}`}>{message.text} <button className="fr-link" onClick={load}>Try again</button></div>
                  : <p className="fr-sub">Loading…</p>
        ) : (
          <>
            <button className="fr-btn secondary fr-deal" onClick={deal} disabled={!!busy}>
              <span className="fr-rowbtn-ico"><Icon name="dice" size={18}/></span>Deal random cards
            </button>

            <div className="fr-board">
              <div className="fr-board-stage">
                <EditableClueTab text={board.clues[0]} pos="top" onChange={v=>updateClue(0,v)} {...cluePill(0)}/>
                <div style={{display:"flex",alignItems:"center"}}>
                  <EditableClueTab text={board.clues[3]} pos="lft" onChange={v=>updateClue(3,v)} {...cluePill(3)}/>
                  <div className="csurface">
                    {boardSlot(0)}{boardSlot(1)}
                    {boardSlot(3)}{boardSlot(2)}
                  </div>
                  <EditableClueTab text={board.clues[1]} pos="rgt" onChange={v=>updateClue(1,v)} {...cluePill(1)}/>
                </div>
                <EditableClueTab text={board.clues[2]} pos="bot" onChange={v=>updateClue(2,v)} {...cluePill(2)}/>
              </div>
              <p className="fr-board-hint">Each clue links the two words facing it. This board is the answer — drag to swap cards, ↻ to turn one.</p>
            </div>

            <section className="fr-surface fr-bonus-zone" aria-label="Bonus cards">
              <div className="fr-eyebrow">Bonus cards</div>
              <p className="fr-bonus-note">These three cards don’t belong on the board. {name} chooses how many to play with.</p>
              <div className="fr-decoys">
                {[4,5,6].map(si=>(
                  <div key={si} className="fr-decoy-col">
                    <div ref={el=>slotRefs.current[si]=el} className={`fr-decoy${dragOver===si?" over":""}`}
                      aria-label={`Bonus card ${si - 3}`}>
                      {renderCard(si)}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <div className="fr-extras">
              <input className="fr-input" maxLength={40} value={title} placeholder="Name it (optional)"
                onChange={e=>{ setTitle(e.target.value); setDirty(true); }} aria-label="Puzzle name"/>
              <button className="fr-btn secondary" onClick={()=>setPreviewKey(Date.now())} disabled={!!busy || !checks.canPublish}>
                <Icon name="eye" size={18}/>Preview
              </button>
            </div>

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
                  {busy==="sending" ? <><Spinner/>Sending…</> : `Send puzzle to ${name}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <DragGhost ghost={ghost}/>
    </div>
  );
}
