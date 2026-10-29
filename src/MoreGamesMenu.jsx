import { useId, useRef } from "react";
import MoreGames from "./MoreGames.jsx";

export default function MoreGamesMenu() {
  const dialog = useRef(null);
  const id = useId();
  return <>
    <button type="button" className="gear-btn" aria-label="More Games" title="More Games"
      aria-haspopup="dialog" aria-controls={id} onClick={() => dialog.current.showModal()}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </button>
    <dialog ref={dialog} id={id} className="cv-games-dialog" aria-label="More Games"
      onClick={(event) => { if (event.target === dialog.current) { const r = dialog.current.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.current.close(); } }}>
      <form method="dialog"><button type="submit" className="gear-btn" aria-label="Close More Games">×</button></form>
      <MoreGames/>
    </dialog>
  </>;
}
