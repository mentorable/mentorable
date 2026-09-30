import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PixelStamp } from "../PixelIcons.jsx";
import {
  BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../agentUi.js";
import { ITEM_CLASS, MENU_Z, SR_ONLY, boardRing } from "./BoardUi.js";

// "Move to" on every card: the way to move a card with a keyboard, a screen
// reader or a thumb (drag and drop is only a shortcut on desktop). A menu
// button in the ARIA pattern: Enter, Space or the arrow keys open it, the
// arrows move through it, Escape or Tab closes it and hands focus back.
//
// The menu is drawn in a portal with fixed positioning, because the board
// scrolls sideways inside a box that would otherwise clip it. It opens below
// the button, or above it when there is no room (the phone nav takes the
// bottom 60px).

const GAP = 6;
const EDGE = 8;
const PHONE_NAV = 76;   // the mobile nav plus a little air

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" shapeRendering="crispEdges"
      style={{ flexShrink: 0 }}>
      <path d="M2 4h2v2H2zM4 6h2v2H4zM6 6h2v2H6zM8 4h2v2H8z" fill="currentColor" />
    </svg>
  );
}

/** `stages`: [{ key, label }]. `onMove(stageKey)` moves the card to the top of
 *  that stage; `onReorder("up" | "down")` moves it within its own stage. */
export default function BoardMoveMenu({ card, stages, onMove, onReorder, canUp = false, canDown = false, disabled = false }) {
  const ink = useAgentInk();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);   // { top, left } once measured
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const focusOnOpen = useRef("first");

  const reorder = [
    ...(canUp ? [{ key: "up", label: "Move up" }] : []),
    ...(canDown ? [{ key: "down", label: "Move down" }] : []),
  ];
  const stageItems = stages.map((s) => ({ key: s.key, label: s.label, stage: true, current: s.key === card.stage }));

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setPlace(null);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const openMenu = (where = "first") => {
    if (disabled) return;
    focusOnOpen.current = where;
    setOpen(true);
  };

  // Measure, then place: below the button if it fits, else above; never off
  // either side of the screen.
  const measure = useCallback(() => {
    const btn = buttonRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const b = btn.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const vw = window.innerWidth;
    const bottomLimit = window.innerHeight - (vw < 768 ? PHONE_NAV : EDGE);
    let top = b.bottom + GAP;
    if (top + h > bottomLimit && b.top - GAP - h >= EDGE) top = b.top - GAP - h;
    top = Math.max(EDGE, Math.min(top, bottomLimit - h));
    const left = Math.max(EDGE, Math.min(b.right - w, vw - w - EDGE));
    setPlace({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  // Focus goes into the menu once it is placed.
  useEffect(() => {
    if (!open || !place || !menuRef.current) return;
    if (menuRef.current.contains(document.activeElement)) return;
    const all = [...menuRef.current.querySelectorAll("[role^='menuitem']")];
    const target = focusOnOpen.current === "last" ? all[all.length - 1] : all[0];
    target?.focus();
  }, [open, place]);

  // Keep it attached while the page or the board scrolls; close on a click
  // anywhere else.
  useEffect(() => {
    if (!open) return undefined;
    let frame = 0;
    const follow = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const outside = (e) => {
      if (menuRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return;
      close(false);
    };
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    document.addEventListener("pointerdown", outside, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
      document.removeEventListener("pointerdown", outside, true);
    };
  }, [open, measure, close]);

  const onButtonKey = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(e.key === "ArrowUp" ? "last" : "first");
    }
  };

  const onMenuKey = (e) => {
    const all = [...menuRef.current.querySelectorAll("[role^='menuitem']")];
    const at = all.indexOf(document.activeElement);
    const go = (i) => { e.preventDefault(); all[(i + all.length) % all.length]?.focus(); };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); close(true); }
  };

  const choose = (item) => {
    if (item.current) { close(true); return; }
    close(true);
    if (item.key === "up" || item.key === "down") onReorder?.(item.key);
    else onMove?.(item.key);
  };

  const renderItem = (item) => (
    <button key={item.key} type="button" tabIndex={-1} className={ITEM_CLASS}
      role={item.stage ? "menuitemradio" : "menuitem"}
      aria-checked={item.stage ? item.current : undefined}
      onClick={() => choose(item)}
      style={{ width: "100%", minHeight: 44, display: "flex", alignItems: "center", gap: 10, padding: "0 10px",
        border: "none", borderRadius: 8, background: "transparent", cursor: "pointer", textAlign: "left",
        fontFamily: SANS, fontSize: "1rem", fontWeight: item.current ? 700 : 600, color: TEXT }}>
      <span aria-hidden="true" style={{ width: 16, display: "inline-flex", color: ink.text }}>
        {item.current && <PixelStamp kind="check" size={16} />}
      </span>
      <span style={{ flex: 1 }}>{item.label}</span>
      {item.current && (
        <span style={{ fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED }}>
          here now<span style={SR_ONLY}>, the card is already in this stage</span>
        </span>
      )}
    </button>
  );

  return (
    <>
      <button ref={buttonRef} type="button" className={FOCUS_CLASS} data-move-for={card.id}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        aria-label={`Move to, ${card.name}`} aria-disabled={disabled || undefined}
        onClick={() => (open ? close(true) : openMenu("first"))} onKeyDown={onButtonKey}
        style={{ flexShrink: 0, minHeight: 44, minWidth: 44, padding: "0 12px", display: "inline-flex", alignItems: "center",
          gap: 7, borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: WHITE, fontFamily: SANS,
          fontSize: "0.9rem", fontWeight: 700, color: disabled ? TEXT_MUTED : TEXT_MID, whiteSpace: "nowrap",
          cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1 }}>
        Move to
        <Chevron />
      </button>

      {open && createPortal(
        <div ref={menuRef} id={menuId} role="menu" aria-label={`Move ${card.name}`} onKeyDown={onMenuKey}
          style={{ "--ag-ring": boardRing(ink.accent), position: "fixed", top: place?.top ?? 0, left: place?.left ?? 0, zIndex: MENU_Z,
            visibility: place ? "visible" : "hidden", minWidth: 216, maxWidth: "calc(100vw - 16px)",
            maxHeight: "calc(100vh - 96px)", overflowY: "auto", boxSizing: "border-box", background: WHITE,
            border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, boxShadow: "0 14px 38px rgba(20,20,19,0.18)",
            padding: 6, fontFamily: SANS }}>
          {reorder.length > 0 && (
            <>
              {reorder.map(renderItem)}
              <div role="separator" style={{ height: 1, background: BORDER, margin: "6px 4px" }} />
            </>
          )}
          <div role="group" aria-label="Stages">
            <p aria-hidden="true" style={{ margin: "4px 10px 2px", fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED }}>
              Move to
            </p>
            {stageItems.map(renderItem)}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
