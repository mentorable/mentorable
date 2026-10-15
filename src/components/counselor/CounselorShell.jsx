import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase.js";
import { counselorErrorMessage, joinLink, rotateJoinCode } from "../../lib/counselor.js";
import { useIsMobile } from "../../hooks/useIsMobile.js";
import { dropAllDrafts } from "../agents/essay/editor/useAutosave.js";
import { Button, SR_ONLY, Toast } from "../ui/kit.jsx";
import {
  AMBER_BG, AMBER_TEXT, BG, BORDER, FOCUS_CLASS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, ringVar, useAgentInk,
} from "../ui/tokens.js";
import {
  BAR_CLASS, ConfirmSheet, ENTRY_PATH, JoinCode, MAIN_CLASS, NAV_CLASS, NO_PRINT, Pill, SCHEDULE_PATH, SHELL_CLASS,
  SKIP_CLASS, linkProps, plural, spacedCode, useCopy,
} from "./counselorUi.jsx";

// The frame every counselor page sits in. There is no student sidebar here:
// a top bar holds the school's name, the two pages (Caseload and Schedule),
// the join code with its copy and replace actions, and Sign out; the page
// goes below it, at most 1180px wide.
//
// Props: `me` is counselorMe()'s value (null before a school exists), `active`
// is "caseload" or "schedule", `navigate` changes page, `pending` (optional)
// is how many meeting requests are waiting, shown on the Schedule link.
// Optional extras the entry page uses: `signedIn` (show Sign out with no
// school yet), `onJoinCode(code)` (told when the code is replaced) and `api`
// (stand-ins for the calls below, when checking the pages by hand).

const REAL_API = {
  rotateJoinCode,
  signOut: async () => {
    // Essay words a student account left unsaved in this tab do not outlive
    // the session, and the next person here starts on the default colour.
    dropAllDrafts();
    try { localStorage.removeItem("profileColor"); } catch { /* storage blocked: nothing was kept */ }
    const { error } = await supabase.auth.signOut();
    // The server could not be reached: sign out on this device at least.
    if (error) await supabase.auth.signOut({ scope: "local" });
  },
  // A full load, so nothing of the signed-out counselor's is left on the page.
  // The page being left is blanked first: a browser may keep it, as it was,
  // for the Back button (see the pageshow guard in the shell).
  leave: () => {
    hidePage();
    window.location.assign(ENTRY_PATH);
  },
};

const TOAST_MS = 7000;
// The gap left between the stuck top bar and whatever the browser scrolls to.
const BAR_GAP = 12;

/** Blank the whole document at once, without waiting for React. */
function hidePage() {
  document.documentElement.style.visibility = "hidden";
}

function Chevron({ up }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false" shapeRendering="crispEdges"
      style={{ flexShrink: 0, transform: up ? "rotate(180deg)" : "none" }}>
      <path d="M2 4h2v2H2zM4 6h2v2H4zM6 6h2v2H6zM8 4h2v2H8z" fill="currentColor" />
    </svg>
  );
}

function NavLink({ to, on, navigate, compact, children }) {
  const ink = useAgentInk();
  return (
    <a {...linkProps(navigate, to)} aria-current={on ? "page" : undefined} className={`${FOCUS_CLASS} ${NAV_CLASS}`}
      style={{ minHeight: 44, padding: compact ? "0 10px" : "0 14px", display: "inline-flex", alignItems: "center", gap: 8,
        borderRadius: 10, boxSizing: "border-box", fontFamily: SANS, fontSize: "1rem", fontWeight: on ? 800 : 700,
        textDecoration: "none", color: on ? ink.onSoft : TEXT_MID, ...(on ? { background: ink.softer } : null) }}>
      {children}
    </a>
  );
}

/** The join code, as one button. It opens a small menu with the three things
 *  that can be done with it: copy the code, copy the link, make a new one. */
function JoinTools({ code, copied, onCopyCode, onCopyLink, onRotate }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    wrap.current?.querySelector("[role=menuitem]")?.focus();
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = { minHeight: 44, width: "100%", padding: "0 14px", display: "flex", alignItems: "center", textAlign: "left",
    background: "none", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: SANS, fontSize: "1rem", fontWeight: 700,
    color: TEXT_MID, boxSizing: "border-box" };
  return (
    <div ref={wrap} style={{ position: "relative", flexShrink: 0 }}>
      <button ref={trigger} type="button" className={FOCUS_CLASS} aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ minHeight: 44, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 10,
          border: `1.5px solid ${BORDER}`, background: WHITE, cursor: "pointer", boxSizing: "border-box", color: TEXT }}>
        <span style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED }}>Join code</span>
        <JoinCode code={code} />
        <Chevron up={open} />
      </button>
      {open && (
        <div role="menu" aria-label="Join code" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 70,
          minWidth: 190, padding: 4, background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
          <button type="button" role="menuitem" className={FOCUS_CLASS} onClick={onCopyCode} style={item}>
            {copied === "code" ? "Copied" : "Copy code"}
          </button>
          <button type="button" role="menuitem" className={FOCUS_CLASS} onClick={onCopyLink} style={item}>
            {copied === "link" ? "Copied" : "Copy link"}
          </button>
          <button type="button" role="menuitem" className={FOCUS_CLASS} style={item}
            onClick={() => { setOpen(false); onRotate(); }}>
            New code
          </button>
        </div>
      )}
    </div>
  );
}

export default function CounselorShell({ me, active, navigate, children, pending = 0, signedIn, onJoinCode, api }) {
  const ink = useAgentInk();
  const isMobile = useIsMobile();
  const compact = useIsMobile(1160);   // below this the bar's one row no longer fits: it folds the join code away
  const calls = useMemo(() => ({ ...REAL_API, ...(api || {}) }), [api]);
  const [copied, copy] = useCopy();
  const [toast, setToast] = useState(null);           // { text, error }
  const [rotateOpen, setRotateOpen] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState("");
  const [fresh, setFresh] = useState("");             // a code made here, until `me` catches up
  const [leaving, setLeaving] = useState(false);
  const alive = useRef(true);
  const mainRef = useRef(null);
  const barRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // Back and Forward can bring a page back exactly as it was left (the
  // back/forward cache), with no reload and so no check of who is signed in.
  // After Sign out on a shared computer, that would put the last student's
  // record back on screen for whoever presses Back. A page restored that way
  // is blanked and loaded again, which asks who is signed in first.
  useEffect(() => {
    const onShow = (e) => {
      if (!e.persisted) return;
      hidePage();
      window.location.reload();
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  // While the bar is stuck to the top, the browser has to leave room for it
  // when it scrolls something into view: without that, tabbing backwards
  // leaves the focused link underneath the bar. The room is the bar's real
  // height, which a long school name can double. It is set on <html>, which
  // the whole app shares, so it is put back when the bar stops sticking (a
  // narrow window) and when the counselor pages are left.
  useEffect(() => {
    const bar = barRef.current;
    if (compact || !bar) return undefined;
    const root = document.documentElement;
    const before = root.style.scrollPaddingTop;
    const fit = () => {
      root.style.scrollPaddingTop = `${Math.ceil(bar.getBoundingClientRect().height) + BAR_GAP}px`;
    };
    fit();
    const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    watch?.observe(bar);
    return () => {
      watch?.disconnect();
      root.style.scrollPaddingTop = before;
    };
  }, [compact]);

  const school = me?.school || null;
  const savedCode = school?.join_code || "";
  useEffect(() => { setFresh(""); }, [savedCode]);
  const code = fresh || savedCode;
  const waiting = Number.isFinite(Number(pending)) ? Math.max(0, Math.trunc(Number(pending))) : 0;
  const showSignOut = signedIn ?? !!me;

  useEffect(() => {
    if (!toast || toast.error) return undefined;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const copyCode = async () => {
    const ok = await copy("code", code);
    if (!ok && alive.current) setToast({ error: true, text: `Couldn't copy. Your join code is ${spacedCode(code)}.` });
  };
  const copyLink = async () => {
    const ok = await copy("link", joinLink(code));
    if (!ok && alive.current) {
      setToast({ error: true, text: "Couldn't copy the link. Give students the code, to enter under My school on their Profile." });
    }
  };

  const openRotate = () => { setRotateError(""); setRotateOpen(true); };
  const rotate = async () => {
    if (rotating) return;
    setRotating(true);
    setRotateError("");
    try {
      const res = await calls.rotateJoinCode();
      const next = typeof res?.join_code === "string" ? res.join_code : "";
      if (!next) throw new Error("no code came back");
      if (!alive.current) return;
      setFresh(next);
      onJoinCode?.(next);
      setRotateOpen(false);
      setToast({ text: `Your new join code is ${spacedCode(next)}. The old one no longer works.` });
    } catch (e) {
      if (alive.current) setRotateError(counselorErrorMessage(e));
    } finally {
      if (alive.current) setRotating(false);
    }
  };

  const signOut = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await calls.signOut();
      calls.leave();
    } catch (e) {
      console.warn("[counselor] sign out failed:", e);
      if (alive.current) {
        setLeaving(false);
        setToast({ error: true, text: "Couldn't sign you out. Try again." });
      }
    }
  };

  const skipToMain = (e) => {
    e.preventDefault();
    mainRef.current?.focus();
    mainRef.current?.scrollIntoView({ block: "start" });
  };

  const identity = (
    <div style={{ flex: compact ? "1 1 0" : "1 1 180px", minWidth: 0 }}>
      {school && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px" }}>
          {/* Shortened beside the demo tag, so the two share a line. */}
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED, lineHeight: 1.3 }}>
            {school.is_demo ? "Mentorable" : "Mentorable for counselors"}
          </p>
          {school.is_demo && <Pill style={{ padding: "0 8px" }}>Demo school</Pill>}
        </div>
      )}
      <p style={{ margin: 0, fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: TEXT, lineHeight: 1.3,
        letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>
        {school ? (school.name || "Your school") : "Mentorable for counselors"}
      </p>
    </div>
  );

  const nav = school && (
    <nav aria-label="Counselor pages" style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <NavLink to={ENTRY_PATH} on={active === "caseload"} navigate={navigate} compact={compact}>Caseload</NavLink>
      <NavLink to={SCHEDULE_PATH} on={active === "schedule"} navigate={navigate} compact={compact}>
        Schedule
        {waiting > 0 && (
          <>
            <span aria-hidden="true" style={{ minWidth: 24, height: 24, padding: "0 6px", boxSizing: "border-box",
              borderRadius: 999, background: AMBER_BG, border: "1px solid #f3d9a4", color: AMBER_TEXT, fontSize: "0.9rem",
              fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontVariantNumeric: "tabular-nums" }}>
              {waiting}
            </span>
            <span style={SR_ONLY}>, {plural(waiting, "meeting request")} waiting</span>
          </>
        )}
      </NavLink>
    </nav>
  );

  const signOutButton = showSignOut && (
    <Button kind="quiet" onClick={signOut} busy={leaving} style={{ padding: "0 10px", fontSize: "0.95rem", flexShrink: 0 }}>
      Sign out
    </Button>
  );

  const tools = (
    <JoinTools code={code} copied={copied} onCopyCode={copyCode} onCopyLink={copyLink} onRotate={openRotate} />
  );

  return (
    <div className={`ui-page ${SHELL_CLASS}`}
      style={{ position: "relative", minHeight: "100vh", background: BG, fontFamily: SANS, color: TEXT, ...ringVar(ink) }}>
      <a href="#counselor-main" onClick={skipToMain} className={`${SKIP_CLASS} ${FOCUS_CLASS}`}>Skip to the page</a>

      <header ref={barRef} className={BAR_CLASS}
        style={{ background: WHITE, borderBottom: `1px solid ${BORDER}`, position: compact ? "static" : "sticky", top: 0,
          zIndex: 60 }}>
        {compact ? (
          // A narrow bar, in the order it is read: the name and the join
          // code button, then the pages and Sign out.
          <div style={{ maxWidth: 1180, margin: "0 auto", boxSizing: "border-box", padding: isMobile ? "8px 16px" : "8px 32px",
            display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 8px" }}>
            {identity}
            {school && tools}
            {school ? (
              <div style={{ flexBasis: "100%", display: "flex", flexWrap: "wrap", alignItems: "center",
                justifyContent: "space-between", gap: "4px 8px" }}>
                {nav}
                {signOutButton}
              </div>
            ) : signOutButton}
          </div>
        ) : (
          <div style={{ maxWidth: 1180, margin: "0 auto", boxSizing: "border-box", padding: "8px 32px", display: "flex",
            flexWrap: "wrap", alignItems: "center", gap: "4px 16px" }}>
            {identity}
            {nav}
            {school && tools}
            {signOutButton}
          </div>
        )}
      </header>

      <main id="counselor-main" ref={mainRef} tabIndex={-1} className={MAIN_CLASS}
        style={{ maxWidth: 1180, width: "100%", margin: "0 auto", boxSizing: "border-box", outline: "none",
          padding: isMobile ? "1.25rem 16px 4rem" : "2rem 32px 4rem" }}>
        {children}
      </main>

      <p aria-live="polite" style={SR_ONLY}>
        {copied === "code" ? "Join code copied." : copied === "link" ? "Join link copied." : ""}
      </p>
      <div className={NO_PRINT}>
        <Toast notice={toast} onDismiss={() => setToast(null)} />
      </div>

      <ConfirmSheet open={rotateOpen} titleId="counselor-rotate-title" title="Make a new join code?"
        confirmLabel="Make a new code" busy={rotating} error={rotateError} onConfirm={rotate}
        onClose={() => setRotateOpen(false)}>
        <p style={{ margin: 0 }}>
          The code you have now stops working at once, and so does the link made from it. Students who have already
          joined stay linked.
        </p>
        <p style={{ margin: "8px 0 0" }}>
          Anyone you gave the old code to will need the new one.
        </p>
      </ConfirmSheet>
    </div>
  );
}
