import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useIsMobile } from "../../../hooks/useIsMobile.js";
import { BORDER, SANS, TEXT, WHITE, ringVar, useAgentInk } from "../agentUi.js";

// A dialog for the outreach screens: a bottom sheet on a phone, a centered
// card on a wider screen. Focus moves in when it opens, Tab stays inside,
// Escape closes it (unless `locked`, while a send is in flight), and focus
// goes back to whatever opened it. Wrap it in <AnimatePresence>.
//
// It always opens at the top, so the title and the explanation are the first
// thing read. Focus goes to the `[data-autofocus]` control only when the
// sheet fits without scrolling; a longer sheet takes focus itself (the WAI
// dialog pattern), so focusing a button at the bottom never scrolls the
// start of it out of view.

const FOCUSABLE = [
  "a[href]", "button:not([disabled])", "textarea:not([disabled])", "input:not([disabled])",
  "select:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

export default function Sheet({ children, onClose, locked = false, labelledBy, label, width = 520 }) {
  const ink = useAgentInk();
  const reduce = useReducedMotion();
  const mobile = useIsMobile(640);
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  const lockedRef = useRef(locked);
  closeRef.current = onClose;
  lockedRef.current = locked;

  // In on open, back to the opener on close. Transforms from the opening
  // animation do not change scrollHeight or clientHeight, so this measures
  // the sheet as it will rest.
  useEffect(() => {
    const opener = document.activeElement;
    const el = panel.current;
    const first = el?.querySelector("[data-autofocus]") || el?.querySelector(FOCUSABLE);
    const fits = !!el && el.scrollHeight <= el.clientHeight + 1;
    ((fits && first) || el)?.focus?.({ preventScroll: true });
    if (el) el.scrollTop = 0;
    return () => { if (opener && document.contains(opener)) opener.focus?.(); };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      const el = panel.current;
      if (!el) return;
      if (e.key === "Escape") {
        if (!lockedRef.current) { e.stopPropagation(); closeRef.current?.(); }
        return;
      }
      if (e.key !== "Tab") return;
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!items.length) { e.preventDefault(); el.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const inside = el.contains(document.activeElement);
      if (!inside || (e.shiftKey && (document.activeElement === first || document.activeElement === el))) {
        e.preventDefault();
        (inside ? last : first).focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const from = reduce ? { opacity: 0 } : mobile ? { y: "100%" } : { opacity: 0, y: 16, scale: 0.97 };
  const to = reduce ? { opacity: 1 } : mobile ? { y: 0 } : { opacity: 1, y: 0, scale: 1 };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.18 }}
      onClick={locked ? undefined : () => onClose?.()}
      style={{ position: "fixed", inset: 0, zIndex: 420, background: "rgba(20,20,19,0.45)", display: "flex",
        alignItems: mobile ? "flex-end" : "center", justifyContent: "center", padding: mobile ? 0 : "1.25rem",
        ...ringVar(ink) }}>
      <motion.div ref={panel} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label}
        tabIndex={-1} initial={from} animate={to} exit={from}
        transition={reduce ? { duration: 0 } : mobile ? { type: "spring", damping: 30, stiffness: 320 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: mobile ? "100%" : width, maxHeight: mobile ? "92vh" : "88vh", overflowY: "auto",
          outline: "none", background: WHITE, boxSizing: "border-box", fontFamily: SANS, color: TEXT,
          borderRadius: mobile ? "22px 22px 0 0" : 20, border: mobile ? "none" : `1px solid ${BORDER}`,
          padding: mobile ? "10px 18px 24px" : "1.6rem", paddingBottom: mobile ? "calc(24px + env(safe-area-inset-bottom, 0px))" : undefined,
          boxShadow: "0 30px 80px rgba(0,0,0,0.25)" }}>
        {mobile && <div aria-hidden="true" style={{ width: 44, height: 5, borderRadius: 99, background: BORDER, margin: "0 auto 14px" }} />}
        {children}
      </motion.div>
    </motion.div>
  );
}
