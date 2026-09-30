import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DANGER, FOCUS_CLASS, RADIUS, SANS, TEXT, WHITE } from "../agentUi.js";
import { TOAST_Z } from "./BoardUi.js";
import { useIsMobile } from "../../../hooks/useIsMobile.js";

// A short message at the bottom of the board (above the phone nav): a failed
// move, a saved card, Gmail connected. Both live regions are always mounted,
// so a screen reader hears each message; a failure goes to the assertive one.
// `toast`: { message, tone: "info" | "error", key } or null.

const ERROR_BG = "#fef2f2";
const ERROR_LINE = "#f5c2bd";

function Bubble({ toast, onDismiss, reduce }) {
  const error = toast.tone === "error";
  return (
    <motion.div key={toast.key}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }} transition={{ duration: reduce ? 0.01 : 0.2, ease: [0.22, 1, 0.36, 1] }}
      style={{ pointerEvents: "auto", display: "flex", alignItems: "center", gap: 6, maxWidth: 560,
        background: error ? ERROR_BG : TEXT, color: error ? DANGER : WHITE,
        border: `1px solid ${error ? ERROR_LINE : TEXT}`, borderRadius: RADIUS.control,
        boxShadow: "0 10px 30px rgba(20,20,19,0.18)", padding: "4px 4px 4px 16px", fontFamily: SANS,
        fontSize: "0.95rem", fontWeight: 600, lineHeight: 1.45 }}>
      <span style={{ flex: 1, padding: "8px 0" }}>{toast.message}</span>
      <button type="button" className={FOCUS_CLASS} onClick={onDismiss} aria-label="Dismiss"
        style={{ flexShrink: 0, width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
          border: "none", background: "none", color: "inherit", cursor: "pointer", borderRadius: 10 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
          strokeLinecap="round" aria-hidden="true" focusable="false">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
}

export default function BoardToast({ toast, onDismiss }) {
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const polite = toast && toast.tone !== "error" ? toast : null;
  const urgent = toast && toast.tone === "error" ? toast : null;
  return (
    <div style={{ position: "fixed", left: 0, right: 0, zIndex: TOAST_Z, pointerEvents: "none",
      bottom: isMobile ? "calc(76px + env(safe-area-inset-bottom, 0px))" : 28,
      display: "flex", flexDirection: "column", alignItems: "center", padding: "0 16px" }}>
      <div role="status" aria-atomic="true" style={{ display: "flex", justifyContent: "center", width: "100%" }}>
        <AnimatePresence>
          {polite && <Bubble toast={polite} onDismiss={onDismiss} reduce={reduce} />}
        </AnimatePresence>
      </div>
      <div role="alert" aria-atomic="true" style={{ display: "flex", justifyContent: "center", width: "100%" }}>
        <AnimatePresence>
          {urgent && <Bubble toast={urgent} onDismiss={onDismiss} reduce={reduce} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
