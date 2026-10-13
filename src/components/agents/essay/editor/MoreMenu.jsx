import { useEffect, useId, useRef, useState } from "react";
import { BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, WHITE } from "../../../ui/tokens.js";
import { ITEM_CLASS } from "../../outreach/BoardUi.js";

// The essay's "more" menu (saved versions, delete). A menu button in the ARIA
// pattern, like the board's "Move to": Enter, Space or the arrow keys open
// it, the arrows move through it, Escape or Tab closes it and hands focus
// back to the button. It drops below the button, against its right edge and
// opening leftward, so it stays on screen only while the button itself sits
// near the right edge of the page: whoever places this keeps it there at
// every width (EditorHeader does, on the row it wraps to on a phone as well).

function Dots() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shapeRendering="crispEdges">
      <path d="M2 7h2v2H2zM7 7h2v2H7zM12 7h2v2h-2z" fill="currentColor" />
    </svg>
  );
}

/** items: [{ key, label, danger, onSelect }]. label: what the button is for. */
export default function MoreMenu({ items, label = "More" }) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const button = useRef(null);
  const menu = useRef(null);
  const focusOnOpen = useRef("first");

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const openMenu = (where = "first") => {
    focusOnOpen.current = where;
    setOpen(true);
  };

  // Focus goes into the menu as it opens; a press anywhere else closes it.
  useEffect(() => {
    if (!open) return undefined;
    const all = [...(menu.current?.querySelectorAll("[role='menuitem']") || [])];
    (focusOnOpen.current === "last" ? all[all.length - 1] : all[0])?.focus();
    const outside = (e) => {
      if (menu.current?.contains(e.target) || button.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  const onButtonKey = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      openMenu(e.key === "ArrowUp" ? "last" : "first");
    }
  };

  const onMenuKey = (e) => {
    const all = [...(menu.current?.querySelectorAll("[role='menuitem']") || [])];
    const at = all.indexOf(document.activeElement);
    const go = (i) => { e.preventDefault(); all[(i + all.length) % all.length]?.focus(); };
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(all.length - 1);
    else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); e.stopPropagation(); close(true); }
  };

  const choose = (item) => {
    // Focus is back on the button before the item acts, so a dialog the item
    // opens hands focus back here when it closes.
    close(true);
    item.onSelect?.();
  };

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button ref={button} type="button" className={FOCUS_CLASS} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? menuId : undefined} aria-label={label}
        onClick={() => (open ? close(true) : openMenu("first"))} onKeyDown={onButtonKey}
        style={{ width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
          borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: WHITE, color: TEXT_MID, cursor: "pointer" }}>
        <Dots />
      </button>
      {open && (
        <div ref={menu} id={menuId} role="menu" aria-label={label} onKeyDown={onMenuKey}
          style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 120, minWidth: 216,
            maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", background: WHITE, border: `1px solid ${BORDER}`,
            borderRadius: RADIUS.control, boxShadow: "0 14px 38px rgba(20,20,19,0.18)", padding: 6, fontFamily: SANS }}>
          {items.map((item) => (
            <button key={item.key} type="button" role="menuitem" tabIndex={-1} className={ITEM_CLASS} onClick={() => choose(item)}
              style={{ width: "100%", minHeight: 44, display: "flex", alignItems: "center", padding: "0 12px", border: "none",
                borderRadius: 8, background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: SANS,
                fontSize: "1rem", fontWeight: 600, color: item.danger ? DANGER : TEXT }}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
