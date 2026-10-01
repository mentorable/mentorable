import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PixelStamp } from "../PixelIcons.jsx";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk } from "../agentUi.js";
import { ITEM_CLASS, MENU_Z, NEUTRAL_TAG, SR_ONLY, boardRing } from "../outreach/BoardUi.js";
import { statusLabel } from "../../../lib/finder.js";

// Where a kept find stands, as a chip on its timeline row, and the way to
// change it without opening the drawer. A menu button in the ARIA pattern
// (as Beaker's "Move to"): Enter, Space or an arrow key opens it on the
// current status, the arrows move, Enter picks, Escape or Tab closes it and
// hands focus back. The drawer still has the full status select (and the
// outcome once a find is done).
//
// The menu is drawn in a portal with fixed positioning, so no row or group
// clips it, and it never runs off the side of a phone.

const GAP = 6;
const EDGE = 8;
const PHONE_NAV = 76;   // the mobile nav plus a little air

const CHOICES = [
  { key: "saved", hint: "Worth a closer look" },
  { key: "applying", hint: "You've started it" },
  { key: "applied", hint: "You've sent it in" },
  { key: "done", hint: "You heard back, or it's over" },
  { key: "dismissed", hint: "Not for you. It won't come back in a later find" },
];

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" shapeRendering="crispEdges"
      style={{ flexShrink: 0 }}>
      <path d="M2 4h2v2H2zM4 6h2v2H4zM6 6h2v2H6zM8 4h2v2H8z" fill="currentColor" />
    </svg>
  );
}

/** The chip's look for each status: the accent for the one being worked on,
 *  quiet for the rest, a dashed edge for a dismissed one (never faded text). */
function chipLook(status, ink) {
  if (status === "applying") return { background: ink.softer, color: ink.onSoft, border: `1px solid ${ink.soft}` };
  if (status === "dismissed") return { background: WHITE, color: TEXT_MID, border: "1px dashed #8a857c" };
  return { background: NEUTRAL_TAG, color: TEXT_MID, border: `1px solid ${NEUTRAL_TAG}` };
}

/** item: a finder_items row. onMove(item, statusKey): change its status. */
export default function StatusChip({ item, onMove }) {
  const ink = useAgentInk();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);   // { top, left } once measured
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const focusOnOpen = useRef("current");
  const label = statusLabel(item.status) || statusLabel("new");

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setPlace(null);
    if (refocus) buttonRef.current?.focus();
  }, []);

  const openMenu = (where = "current") => {
    focusOnOpen.current = where;
    setOpen(true);
  };

  // Measure, then place: below the chip if it fits, else above; never off
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
    const left = Math.max(EDGE, Math.min(b.left, vw - w - EDGE));
    setPlace({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  // Focus goes into the menu once it is placed: on the current status, or
  // the first or last choice when an arrow key opened it.
  useEffect(() => {
    if (!open || !place || !menuRef.current) return;
    if (menuRef.current.contains(document.activeElement)) return;
    const all = [...menuRef.current.querySelectorAll("[role='menuitemradio']")];
    const current = all.find((el) => el.getAttribute("aria-checked") === "true");
    const target = focusOnOpen.current === "last" ? all[all.length - 1]
      : focusOnOpen.current === "first" ? all[0]
      : current || all[0];
    target?.focus();
  }, [open, place]);

  // Keep it attached while the page scrolls; close on a press anywhere else.
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
    const all = [...menuRef.current.querySelectorAll("[role='menuitemradio']")];
    const at = all.indexOf(document.activeElement);
    const go = (i) => { e.preventDefault(); all[(i + all.length) % all.length]?.focus(); };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); close(true); }
  };

  const choose = (key) => {
    close(true);
    if (key !== item.status) onMove(item, key);
  };

  return (
    <>
      {/* The hit area is 44px tall; the chip drawn inside it stays small. */}
      <button ref={buttonRef} type="button" className={FOCUS_CLASS} data-chip-for={item.id}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(true) : openMenu("current"))} onKeyDown={onButtonKey}
        style={{ flexShrink: 0, minHeight: 44, padding: "0 2px", margin: "0 -2px", display: "inline-flex",
          alignItems: "center", border: "none", background: "none", borderRadius: RADIUS.pill, cursor: "pointer",
          fontFamily: SANS }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 9px 3px 11px",
          borderRadius: RADIUS.pill, fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.35, whiteSpace: "nowrap",
          ...chipLook(item.status, ink) }}>
          {item.status === "applied" && <PixelStamp kind="check" size={16} />}
          {label}
          <Chevron />
        </span>
        <span style={SR_ONLY}>, where &quot;{item.title}&quot; stands. Change it</span>
      </button>

      {open && createPortal(
        <div ref={menuRef} id={menuId} role="menu" aria-label={`Move "${item.title}" to`} onKeyDown={onMenuKey}
          style={{ "--ag-ring": boardRing(ink.accent), position: "fixed", top: place?.top ?? 0, left: place?.left ?? 0,
            zIndex: MENU_Z, visibility: place ? "visible" : "hidden", width: 268, maxWidth: "calc(100vw - 16px)",
            maxHeight: "calc(100vh - 96px)", overflowY: "auto", boxSizing: "border-box", background: WHITE,
            border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, boxShadow: "0 14px 38px rgba(20,20,19,0.18)",
            padding: 6, fontFamily: SANS }}>
          <p aria-hidden="true" style={{ margin: "4px 10px 2px", fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED }}>
            Move to
          </p>
          {CHOICES.map((c) => {
            const current = c.key === item.status;
            return (
              <button key={c.key} type="button" tabIndex={-1} className={ITEM_CLASS} role="menuitemradio"
                aria-checked={current} onClick={() => choose(c.key)}
                style={{ width: "100%", minHeight: 44, display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "7px 10px", border: "none", borderRadius: 8, background: "transparent", cursor: "pointer",
                  textAlign: "left", fontFamily: SANS, color: TEXT }}>
                <span aria-hidden="true" style={{ width: 16, flexShrink: 0, marginTop: 2, display: "inline-flex",
                  color: ink.text }}>
                  {current && <PixelStamp kind="check" size={16} />}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "1rem", fontWeight: current ? 800 : 700, lineHeight: 1.3 }}>
                    {statusLabel(c.key)}
                  </span>
                  <span style={{ display: "block", marginTop: 1, fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED,
                    lineHeight: 1.35 }}>
                    {c.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
