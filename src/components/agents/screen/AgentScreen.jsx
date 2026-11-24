import { useEffect, useId, useMemo, useRef, useState } from "react";
import Mascot from "../Mascot.jsx";
import { PixelStamp } from "../../ui/PixelIcons.jsx";
import { Button, SR_ONLY } from "../../ui/kit.jsx";
import {
  BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_FAINT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../ui/tokens.js";
import { addressOf, tabLabel } from "./screenModel.js";

// The agent's screen: a browser window that shows what the agent is really
// looking at while it works on its own. Each tab is one thing that happened
// on the server (screen.py): a search with the results it got back, a page it
// opened with the start of what it read, the facts it kept, the draft it
// wrote, or the doc a student opened in Quill. Nothing here is staged: no tab
// exists until its event arrives, and a page only shows text that was read.
//
// Following and pausing. While the agent works, the screen follows it to each
// new tab. The moment the student does anything on the screen (picks a tab,
// even the newest; touches the tab strip; scrolls or focuses the page) it
// pauses and stays exactly where they are, so nothing is ever pulled out from
// under someone reading. "Back to live" resumes, with a count of what opened
// meanwhile. The tabs are a real tablist (arrow keys from whichever tab has
// focus, Home, End). A search result the agent went on to read has a button
// that jumps to the tab where it read it.
//
// The checklist beside the screen stays the page's one live region, so this
// never talks over it. Where there is no checklist (Quill's doc sheet) the
// host page announces instead.
//
// mode="doc" is the one-document view (Quill opening the student's own doc):
// no tab strip, no live pill, just the window and the page.
//
// Motion: a search's query types itself into the box and a draft writes
// itself out, once, the first time they are shown live; looking back at them
// later shows them whole. A page settles in as it loads, and the loading bar
// runs under the address. Every frame of every animation shows the content,
// and all of it is off under reduced motion.

const CSS = `
@keyframes as-load { from { opacity: .55; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes as-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
@keyframes as-caret { 50% { opacity: 0; } }
@keyframes as-breathe { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
.as-load { animation: as-load .38s cubic-bezier(.16,1,.3,1); }
.as-bar { animation: as-bar 1.3s cubic-bezier(.65,0,.35,1) infinite; }
.as-caret { animation: as-caret 1s steps(1) infinite; }
.as-breathe { animation: as-breathe 2.4s ease-in-out infinite; }
.as-view { scrollbar-width: thin; scrollbar-color: ${BORDER} transparent; }
.as-view::-webkit-scrollbar { width: 10px; }
.as-view::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: ${RADIUS.pill}px; }
.as-tabs { scrollbar-width: none; }
.as-tabs::-webkit-scrollbar { display: none; }
.as-tab.${FOCUS_CLASS}:focus-visible { outline-offset: -3px; }
.as-tab:hover { background: ${WHITE}; color: ${TEXT}; }
.as-link { text-decoration: none; }
.as-link:hover, .as-link:focus-visible { text-decoration: underline; text-underline-offset: 3px; }
.as-view ::selection { background: var(--as-select); }
@media (prefers-reduced-motion: reduce) {
  .as-load, .as-bar, .as-caret, .as-breathe { animation: none; }
  .as-bar { transform: none; width: 100% !important; opacity: .35; }
}
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-agent-screen]")) {
  const el = document.createElement("style");
  el.dataset.agentScreen = "";
  el.textContent = CSS;
  document.head.appendChild(el);
}

const REDUCED = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const reduced = () => !!REDUCED?.matches;

const STAMP = { search: "search", page: "page", notes: "check", compose: "letter", doc: "scroll" };
const MEASURE = "36rem";        // about 70 characters of body text
const AGENT_NAMES = { beaker: "Beaker", talon: "Talon", quill: "Quill", poise: "Poise" };
// What each agent's tabs can be, for its help line.
const TAB_KINDS = {
  beaker: "a search it ran, a page it read, the facts it kept or the draft it wrote",
  talon: "a search it ran or a page it read",
};

/** Reveals `text` a few characters at a time when `animate`, else all at once. */
function useTyped(text, { animate, maxMs = 2600 }) {
  const live = animate && !reduced() && !!text;
  const [n, setN] = useState(() => (live ? 0 : text.length));
  useEffect(() => {
    if (!live) { setN(text.length); return undefined; }
    const step = Math.max(1, Math.ceil(text.length / Math.max(1, (maxMs / 1000) * 30)));
    const t = setInterval(() => setN((v) => {
      if (v + step >= text.length) { clearInterval(t); return text.length; }
      return v + step;
    }), 33);
    return () => clearInterval(t);
  }, [text, live, maxMs]);
  return text.slice(0, n);
}

function ExternalLink({ href, children, style, className = "", mark = false }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`as-link ${FOCUS_CLASS} ${className}`.trim()}
      style={{ borderRadius: RADIUS.control, ...style }}>
      {children}
      {mark && <span aria-hidden="true" style={{ display: "inline-flex", marginLeft: 6, verticalAlign: "-2px" }}><PixelStamp kind="out" size={16} /></span>}
      <span style={SR_ONLY}> (opens in a new tab)</span>
    </a>
  );
}

function Caret({ ink }) {
  return (
    <span aria-hidden="true" className="as-caret" style={{ display: "inline-block", width: 2, height: "1.05em",
      marginLeft: 1, verticalAlign: "-0.15em", background: ink.text }} />
  );
}

// ── The views ────────────────────────────────────────────────────────────────

function Waiting({ stamp, children }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", maxWidth: MEASURE }}>
      {stamp && <span aria-hidden="true" style={{ color: TEXT_FAINT, display: "flex", paddingTop: 3 }}><PixelStamp kind={stamp} size={16} /></span>}
      <p style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.55 }}>{children}</p>
    </div>
  );
}

function SearchView({ shot, readTab, onJump, ink, name, animate, next }) {
  const typed = useTyped(shot.query, { animate, maxMs: 900 });
  const typing = typed.length < shot.query.length;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 46, padding: "0 14px", boxSizing: "border-box",
        border: `1px solid ${BORDER}`, borderRadius: RADIUS.pill, background: WHITE, color: TEXT_FAINT, maxWidth: 620 }}>
        <PixelStamp kind="search" size={16} />
        <span style={{ fontSize: "1rem", fontWeight: 600, color: TEXT, minWidth: 0, overflowWrap: "anywhere", padding: "10px 0",
          lineHeight: 1.35 }}>
          <span style={SR_ONLY}>{name} searched for: </span>{typed}
          {(typing || shot.status === "active") && <Caret ink={ink} />}
        </span>
      </div>

      <div style={{ marginTop: 18 }}>
        {shot.status === "active" ? (
          <>
            <p style={SR_ONLY}>Waiting for results.</p>
            <div aria-hidden="true" style={{ display: "grid", gap: 18 }}>
              {[0.92, 0.74, 0.84].map((w, i) => (
                <div key={i} style={{ display: "grid", gap: 7 }}>
                  <span style={{ width: 120, height: 10, borderRadius: RADIUS.pill, background: SURFACE, border: `1px solid ${BORDER}` }} />
                  <span style={{ width: `${w * 100}%`, maxWidth: 520, height: 14, borderRadius: RADIUS.pill, background: ink.softer }} />
                  <span style={{ width: `${w * 88}%`, maxWidth: 480, height: 10, borderRadius: RADIUS.pill, background: SURFACE, border: `1px solid ${BORDER}` }} />
                </div>
              ))}
            </div>
          </>
        ) : shot.status === "failed" ? (
          <div style={{ display: "grid", gap: 8 }}>
            <Waiting stamp="cross">That search didn't go through. {name} carried on with its other searches.</Waiting>
            {next && (
              <button type="button" onClick={() => onJump(next)} className={`as-link ${FOCUS_CLASS}`}
                style={{ justifySelf: "start", marginLeft: 28, minHeight: 44, padding: 0, border: "none", background: "transparent",
                  color: ink.text, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 800, textDecoration: "underline",
                  textUnderlineOffset: 3, cursor: "pointer", borderRadius: RADIUS.control }}>
                Go to its next search
              </button>
            )}
          </div>
        ) : shot.results.length === 0 ? (
          <Waiting stamp="search">Nothing came back for this one.</Waiting>
        ) : (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 18 }}>
            {shot.results.map((r) => {
              const tab = readTab.get(r.url);
              return (
                <li key={r.url} style={{ minWidth: 0, maxWidth: MEASURE }}>
                  <span aria-hidden="true" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", fontWeight: 700,
                    color: TEXT_MUTED, minWidth: 0 }}>
                    <span style={{ width: 20, height: 20, borderRadius: RADIUS.control / 2, background: ink.softer, color: ink.onSoft,
                      display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, lineHeight: 1,
                      flexShrink: 0 }}>{(r.domain || "?")[0].toUpperCase()}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.domain}</span>
                  </span>
                  <ExternalLink href={r.url} style={{ display: "flex", alignItems: "center", minHeight: 44, fontSize: "1.1rem",
                    fontWeight: 800, color: ink.text, lineHeight: 1.35, overflowWrap: "anywhere", letterSpacing: "-0.01em" }}>
                    {r.title}
                    {tab && <span style={SR_ONLY}>. {name} read this page.</span>}
                  </ExternalLink>
                  {r.snippet && (
                    <p style={{ margin: 0, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.5 }}>{r.snippet}</p>
                  )}
                  {tab && (
                    <button type="button" onClick={() => onJump(tab)} className={FOCUS_CLASS}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8, minHeight: 44, padding: "0 14px",
                        borderRadius: RADIUS.pill, background: ink.softer, border: `1px solid ${ink.soft}`, color: ink.onSoft,
                        fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, cursor: "pointer" }}>
                      <PixelStamp kind="check" size={16} />See what {name} read here
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function PageView({ shot, name, ink, from, onJump }) {
  if (shot.status === "active") {
    return <Waiting stamp="page">Opening {shot.domain}. {name} reads the page itself, not just the search result.</Waiting>;
  }
  if (shot.status === "failed") {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Waiting stamp="cross">{shot.domain} wouldn't open, or had nothing to read. That happens, and {name} moved on to the next page.</Waiting>
        <p style={{ margin: "0 0 0 28px", fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
          <ExternalLink href={shot.url} style={{ color: ink.text, fontWeight: 800, textDecoration: "underline", textUnderlineOffset: 3,
            display: "inline-flex", alignItems: "center", minHeight: 44 }} mark>Try opening it yourself</ExternalLink>
        </p>
      </div>
    );
  }
  const cut = shot.excerpt && shot.excerpt.length >= 880;
  const link = { color: ink.text, fontWeight: 800, textDecoration: "underline", textUnderlineOffset: 3, display: "inline-flex",
    alignItems: "center", minHeight: 44 };
  return (
    <article style={{ maxWidth: MEASURE }}>
      <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: TEXT, lineHeight: 1.3, letterSpacing: "-0.01em",
        overflowWrap: "anywhere" }}>{shot.title || shot.domain}</h3>
      <p style={{ margin: "4px 0 0", fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED }}>{shot.domain}</p>
      <p style={{ margin: "14px 0 0", fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.7, overflowWrap: "anywhere" }}>
        {shot.excerpt || "This page had no text to show here."}{cut && "…"}
      </p>
      <div style={{ margin: "16px 0 0", paddingTop: 6, borderTop: `1px solid ${BORDER}`, display: "flex", flexWrap: "wrap",
        alignItems: "center", gap: "0 18px", fontSize: "0.95rem" }}>
        <span style={{ fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
          {cut ? `That's the start of what ${name} read.` : `That's what ${name} read.`}
        </span>
        <ExternalLink href={shot.url} style={link} mark>Open the page</ExternalLink>
        {from && (
          <button type="button" onClick={() => onJump(from)} className={`as-link ${FOCUS_CLASS}`}
            style={{ ...link, padding: 0, border: "none", background: "transparent", fontFamily: SANS, fontSize: "0.95rem",
              cursor: "pointer", borderRadius: RADIUS.control }}>
            Back to the search
          </button>
        )}
      </div>
    </article>
  );
}

function NotesView({ shot, ink, name }) {
  return (
    <div style={{ maxWidth: MEASURE }}>
      <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>{shot.title || "What checked out"}</h3>
      <p style={{ margin: "4px 0 14px", fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 }}>
        Each fact links to the page {name} found it on. Anything it couldn't find on a page was left out.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
        {shot.notes.map((n, i) => (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 10, alignItems: "start" }}>
            <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: RADIUS.control / 2, background: ink.softer,
              color: ink.onSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><PixelStamp kind="check" size={16} /></span>
            <span style={{ display: "grid", fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.5, minWidth: 0 }}>
              <span>{n.text}</span>
              {n.url && (
                <ExternalLink href={n.url} mark style={{ justifySelf: "start", display: "inline-flex", alignItems: "center",
                  minHeight: 44, color: ink.text, fontSize: "0.9rem", fontWeight: 800, textDecoration: "underline",
                  textUnderlineOffset: 3, overflowWrap: "anywhere" }}>
                  <span style={SR_ONLY}>Source: </span>{n.domain}
                </ExternalLink>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComposeView({ shot, ink, animate }) {
  const body = useTyped(shot.body, { animate, maxMs: 2600 });
  const writing = body.length < shot.body.length;
  const row = { display: "grid", gridTemplateColumns: "72px minmax(0,1fr)", gap: 8, padding: "9px 0",
    borderBottom: `1px solid ${BORDER}`, fontSize: "1rem", lineHeight: 1.4 };
  return (
    <div style={{ maxWidth: MEASURE }}>
      <div style={row}><span style={{ fontWeight: 700, color: TEXT_MUTED }}>To</span>
        <span style={{ fontWeight: 600, color: TEXT, overflowWrap: "anywhere" }}>{shot.to || "You'll add an address"}</span></div>
      <div style={row}><span style={{ fontWeight: 700, color: TEXT_MUTED }}>Subject</span>
        <span style={{ fontWeight: 700, color: TEXT, overflowWrap: "anywhere" }}>{shot.subject}</span></div>
      <p style={{ margin: "14px 0 0", whiteSpace: "pre-wrap", fontSize: "1rem", fontWeight: 500, color: TEXT, lineHeight: 1.65,
        overflowWrap: "anywhere" }}>
        {writing && <span style={SR_ONLY}>{shot.body}</span>}
        <span aria-hidden={writing || undefined}>{body}</span>
        {writing && <Caret ink={ink} />}
      </p>
      <p style={{ margin: "16px 0 0", display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.95rem", fontWeight: 700,
        color: TEXT_MUTED, lineHeight: 1.5 }}>
        <span aria-hidden="true" style={{ display: "flex", paddingTop: 2, flexShrink: 0 }}><PixelStamp kind="lock" size={16} /></span>
        Not sent. It waits on your board for you to read, change and send yourself.
      </p>
    </div>
  );
}

function DocView({ shot, name, isMobile }) {
  if (shot.status === "active") return <Waiting stamp="scroll">Opening your doc. {name} only reads it; nothing in it changes.</Waiting>;
  if (shot.status === "failed") return <Waiting stamp="cross">{name} couldn't open that doc. What went wrong is just above.</Waiting>;
  const paras = shot.text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  return (
    <div style={{ background: WHITE, border: isMobile ? "none" : `1px solid ${BORDER}`, borderRadius: RADIUS.control, maxWidth: 640,
      margin: isMobile ? "-18px -20px" : "0 auto", padding: isMobile ? "20px" : "28px clamp(18px, 5vw, 40px)", boxSizing: "border-box" }}>
      {shot.title && (
        <h3 style={{ margin: "0 0 14px", fontSize: "1.3rem", fontWeight: 800, color: TEXT, lineHeight: 1.3, overflowWrap: "anywhere" }}>
          {shot.title}
        </h3>
      )}
      {paras.slice(0, 80).map((p, i) => (
        <p key={i} style={{ margin: i ? "12px 0 0" : 0, fontSize: "1rem", fontWeight: 500, color: TEXT, lineHeight: 1.7,
          overflowWrap: "anywhere", maxWidth: MEASURE }}>{p}</p>
      ))}
    </div>
  );
}

// ── The window ───────────────────────────────────────────────────────────────

function TabIcon({ shot, ink }) {
  if (shot.status === "active") return <span aria-hidden="true" style={{ display: "flex", color: ink.text }}><PixelStamp kind="sparkle" size={16} /></span>;
  if (shot.status === "failed") return <span aria-hidden="true" style={{ display: "flex", color: TEXT_FAINT }}><PixelStamp kind="cross" size={16} /></span>;
  return <span aria-hidden="true" style={{ display: "flex" }}><PixelStamp kind={STAMP[shot.kind]} size={16} /></span>;
}

function StatePill({ state, ink }) {
  const on = state === "live";
  const text = { live: "Live", paused: "Paused here", done: "Finished" }[state];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "3px 10px", borderRadius: RADIUS.pill,
      background: on ? ink.softer : WHITE, border: `1px solid ${on ? ink.soft : BORDER}`,
      color: on ? ink.onSoft : TEXT_MID, fontSize: "0.9rem", fontWeight: 800, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" className={on ? "as-breathe" : undefined}
        style={{ width: 8, height: 8, background: on ? ink.text : TEXT_FAINT }} />
      {text}
    </span>
  );
}

/** Whether the tab strip has more tabs off either edge. */
function useOverflow(ref, deps) {
  const [edges, setEdges] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const check = () => setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(check) : null;
    ro?.observe(el);
    return () => { el.removeEventListener("scroll", check); ro?.disconnect(); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return edges;
}

/**
 * shots:   the tabs, from mergeScreen
 * agent:   "beaker" | "talon" | "quill", for the name and the mascot
 * running: whether the agent is still working
 * idle:    what the empty screen says before the first tab opens
 * mode:    "tabs" (default), or "doc" for one document and no tab strip
 * mascot:  show the agent in the title bar (where no mascot is on the page already)
 */
export default function AgentScreen({ shots, agent = "beaker", running = false, isMobile = false, height, idle, mode = "tabs",
  mascot = false, style }) {
  const ink = useAgentInk();
  const name = AGENT_NAMES[agent] || "The agent";
  const [pick, setPick] = useState(null);
  const [seenAt, setSeenAt] = useState(0);
  const [help, setHelp] = useState(false);
  const tabRefs = useRef(new Map());
  const stripRef = useRef(null);
  const panelRef = useRef(null);
  const animated = useRef(new Set());       // tabs already typed out once, live
  const baseId = useId();
  const tabsMode = mode !== "doc";

  const newest = shots.length ? shots[shots.length - 1] : null;
  const firstSeq = shots[0]?.seq;
  useEffect(() => { if (!shots.length || firstSeq === 1) { setPick(null); setSeenAt(0); } }, [shots.length === 0, firstSeq]); // eslint-disable-line react-hooks/exhaustive-deps
  const picked = pick && shots.find((s) => s.id === pick);
  const shown = picked || newest;
  const following = !picked;
  const missed = following ? 0 : shots.filter((s) => s.seq > seenAt).length;
  const state = !running ? "done" : following ? "live" : "paused";
  const readTab = useMemo(() => {
    const map = new Map();
    for (const s of shots) if (s.kind === "page" && s.status === "done") map.set(s.url, s.id);
    return map;
  }, [shots]);
  // The search that led to a page: the latest search before it that returned it.
  const fromSearch = useMemo(() => {
    if (!shown || shown.kind !== "page") return null;
    const before = shots.filter((s) => s.seq < shown.seq && s.kind === "search" && s.results?.some((r) => r.url === shown.url));
    return before.length ? before[before.length - 1].id : null;
  }, [shots, shown]);
  const nextSearch = useMemo(() => {
    if (!shown || shown.kind !== "search" || shown.status !== "failed") return null;
    return shots.find((s) => s.seq > shown.seq && s.kind === "search")?.id || null;
  }, [shots, shown]);
  const edges = useOverflow(stripRef, [shots.length > 0, tabsMode]);
  const viewHeight = height || (isMobile ? 320 : 380);
  const dropped = shots.length && shots[0].seq > 1 ? shots[0].seq - 1 : 0;

  // Typing plays once, the first time a tab is shown while the agent is live.
  const animate = !!shown && running && following && !animated.current.has(shown.id);
  useEffect(() => {
    if (shown && shown.status === "done") animated.current.add(shown.id);
  }, [shown?.id, shown?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Every tab starts at its top (a reset the screen makes is not the student
  // scrolling, so it never pauses), and the shown tab stays in view on the strip.
  const resetting = useRef(false);
  useEffect(() => {
    const panel = panelRef.current;
    if (panel && panel.scrollTop !== 0) { resetting.current = true; panel.scrollTop = 0; }
    const el = shown && tabRefs.current.get(shown.id);
    const strip = stripRef.current;
    if (!el || !strip) return;
    const left = el.offsetLeft - 24;
    const right = el.offsetLeft + el.offsetWidth + 24;
    const behavior = reduced() ? "auto" : "smooth";
    if (left < strip.scrollLeft) strip.scrollTo({ left, behavior });
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollTo({ left: right - strip.clientWidth, behavior });
  }, [shown?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Stop following and stay on `id` (the tab in view, when none is given). */
  const pause = (id = shown?.id) => {
    if (!id) return;
    if (following) setSeenAt(newest?.seq || 0);
    setPick(id);
  };
  // Anything the student does on a live screen pauses it where they are.
  const holdHere = () => { if (running && following && shown) pause(shown.id); };
  const sectionRef = useRef(null);
  const jump = (id) => {
    pause(id);
    panelRef.current?.focus({ preventScroll: true });
    sectionRef.current?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" });
  };
  // Only a real scroll of the page pauses it: one the screen made itself doesn't.
  const onPanelScroll = () => {
    if (resetting.current) { resetting.current = false; return; }
    holdHere();
  };
  // A mouse wheel over the tab strip scrolls it sideways (it has no scrollbar).
  const onStripWheel = (e) => {
    const el = stripRef.current;
    if (!el || el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
  };
  const backToLive = () => {
    setPick(null);
    requestAnimationFrame(() => { if (newest) tabRefs.current.get(newest.id)?.focus({ preventScroll: true }); });
  };
  const onKey = (e) => {
    const focused = shots.findIndex((s) => tabRefs.current.get(s.id) === document.activeElement);
    const at = focused >= 0 ? focused : shots.findIndex((s) => s.id === shown?.id);
    const go = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: shots.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    const target = shots[Math.max(0, Math.min(shots.length - 1, go))];
    if (!target) return;
    pause(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  // The panel only holds the scroll when it has something to scroll.
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  });

  const address = shown ? addressOf(shown, name) : { url: "", text: "" };
  const addressText = shown?.kind === "search" && shown.status === "done"
    ? `Web search, ${shown.results.length} ${shown.results.length === 1 ? "result" : "results"}`
    : address.text;
  const secure = shown?.kind === "page" && shown.status === "done" && address.url.startsWith("https:");
  const loading = shown?.status === "active";
  const fade = (side) => ({ position: "absolute", top: 0, bottom: 0, [side]: 0, width: 28, pointerEvents: "none",
    background: `linear-gradient(to ${side === "left" ? "right" : "left"}, ${SURFACE}, transparent)` });

  return (
    <section ref={sectionRef} aria-label={`${name}'s screen`} style={{ position: "relative", background: WHITE, border: `1px solid ${BORDER}`,
      borderRadius: RADIUS.card, overflow: "hidden", fontFamily: SANS, minWidth: 0, "--as-select": ink.soft, ...style }}>
      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 6px 6px 14px", minHeight: 56, boxSizing: "border-box",
        background: SURFACE, borderBottom: `1px solid ${BORDER}`, minWidth: 0 }}>
        {mascot && <Mascot agent={agent} state={running ? "thinking" : "idle"} size={28} title="" />}
        {!(isMobile && state === "paused") && (
          <span style={{ fontSize: "1rem", fontWeight: 800, color: TEXT, whiteSpace: "nowrap", overflow: "hidden",
            textOverflow: "ellipsis", minWidth: 0 }}>{name}'s screen</span>
        )}
        {tabsMode && <StatePill state={state} ink={ink} />}
        <span style={{ flex: "1 1 0", minWidth: 0 }} />
        {state === "paused" && (
          <Button kind="secondary" onClick={backToLive} style={{ padding: "8px 14px", flexShrink: 0 }}
            aria-label={`Back to live${missed ? `, ${missed} new ${missed === 1 ? "tab" : "tabs"}` : ""}`}>
            Back to live{missed ? ` (${missed})` : ""}
          </Button>
        )}
        {tabsMode && (
          <Button kind="quiet" aria-expanded={help} aria-controls={`${baseId}-help`} onClick={() => setHelp((h) => !h)}
            aria-label={isMobile ? "What's this?" : undefined}
            style={{ padding: isMobile ? "8px 12px" : "8px 12px", flexShrink: 0 }}>
            {isMobile ? <PixelStamp kind="question" size={16} /> : "What's this?"}
          </Button>
        )}
      </div>

      {state === "paused" && (
        <p style={{ margin: 0, padding: "8px 16px", background: WHITE, borderBottom: `1px solid ${BORDER}`, fontSize: "0.9rem",
          fontWeight: 700, color: TEXT_MID, lineHeight: 1.45 }}>
          {name} is still working. You're looking back, so the screen is holding still for you.
        </p>
      )}

      {tabsMode && help && (
        <div id={`${baseId}-help`} style={{ padding: "12px 16px", background: ink.softer, borderBottom: `1px solid ${ink.soft}`,
          fontSize: "0.95rem", fontWeight: 600, color: TEXT, lineHeight: 1.55 }}>
          <p style={{ margin: 0, maxWidth: MEASURE }}>
            This is what {name} is really doing on its own. Each tab is {TAB_KINDS[agent] || "something it opened"}, and
            nothing shows up here until it has happened.
          </p>
          <p style={{ margin: "6px 0 0", maxWidth: MEASURE }}>
            While it works, the newest tab opens by itself. Pick a tab or scroll a page and the screen pauses right there;
            Back to live catches you up.
          </p>
        </div>
      )}

      {/* Tabs */}
      {tabsMode && shots.length > 0 && (
        <div style={{ position: "relative", background: SURFACE, borderBottom: `1px solid ${BORDER}` }}>
          <div ref={stripRef} role="tablist" aria-label={`What ${name} opened`} onKeyDown={onKey} className="as-tabs"
            onPointerDown={holdHere} onWheel={onStripWheel}
            style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 4, padding: "8px 10px 0", overflowX: "auto" }}>
            {dropped > 0 && (
              <span style={{ flexShrink: 0, alignSelf: "center", padding: "0 8px 6px", fontSize: "0.9rem", fontWeight: 700,
                color: TEXT_MUTED, whiteSpace: "nowrap" }}>{dropped} earlier closed</span>
            )}
            {shots.map((s) => {
              const on = s.id === shown?.id;
              const label = tabLabel(s, name);
              return (
                <button key={s.id} type="button" role="tab" id={`${baseId}-tab-${s.id}`} aria-selected={on}
                  aria-controls={`${baseId}-panel`} tabIndex={on ? 0 : -1} title={label}
                  ref={(el) => { if (el) tabRefs.current.set(s.id, el); else tabRefs.current.delete(s.id); }}
                  onClick={() => pause(s.id)} className={`as-tab ${FOCUS_CLASS}`}
                  style={{ position: "relative", display: "flex", alignItems: "center", gap: 7, flexShrink: 0,
                    maxWidth: isMobile ? 160 : 220, minHeight: 44, padding: "0 12px", marginBottom: -1,
                    border: `1px solid ${on ? BORDER : "transparent"}`, borderBottom: `1px solid ${on ? WHITE : "transparent"}`,
                    borderRadius: `${RADIUS.control}px ${RADIUS.control}px 0 0`, background: on ? WHITE : "transparent",
                    color: on ? TEXT : TEXT_MUTED, fontFamily: SANS, fontSize: "0.9rem", fontWeight: on ? 800 : 700,
                    cursor: "pointer" }}>
                  <TabIcon shot={s} ink={ink} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                  <span style={SR_ONLY}>{s.status === "active" ? ", opening" : s.status === "failed" ? ", didn't work" : ""}</span>
                </button>
              );
            })}
          </div>
          {edges.left && <span aria-hidden="true" style={fade("left")} />}
          {edges.right && <span aria-hidden="true" style={fade("right")} />}
        </div>
      )}

      {/* Address bar */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
        borderBottom: `1px solid ${BORDER}`, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "0 12px",
          borderRadius: RADIUS.pill, background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_FAINT }}>
          <span aria-hidden="true" style={{ display: "flex", flexShrink: 0 }}>
            <PixelStamp kind={secure ? "lock" : shown ? STAMP[shown.kind] : "sparkle"} size={16} />
          </span>
          <span style={{ fontSize: "0.9rem", fontWeight: 700, color: TEXT_MID, minWidth: 0, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={SR_ONLY}>{address.url ? "Address: " : "Showing: "}</span>{addressText || `${name} hasn't opened anything yet`}
          </span>
        </div>
        {shown?.kind === "doc" && address.url && shown.status === "done" && (
          <ExternalLink href={address.url} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 12px",
            color: ink.text, fontSize: "0.95rem", fontWeight: 800, whiteSpace: "nowrap" }}>
            {isMobile ? "Open" : "Open in Google Docs"}
            {isMobile && <span style={SR_ONLY}> in Google Docs</span>}
          </ExternalLink>
        )}
        {loading && (
          <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, overflow: "hidden" }}>
            <span className="as-bar" style={{ display: "block", width: "40%", height: "100%", background: ink.ring }} />
          </span>
        )}
      </div>

      {/* The page */}
      <div ref={panelRef} id={`${baseId}-panel`} role={tabsMode && shots.length ? "tabpanel" : "region"}
        aria-labelledby={tabsMode && shown ? `${baseId}-tab-${shown.id}` : undefined}
        aria-label={tabsMode && shown ? undefined : `${name}'s page`} tabIndex={0}
        onScroll={onPanelScroll} onFocus={holdHere}
        className={`as-view ${FOCUS_CLASS}`}
        style={{ height: viewHeight, overflowY: "auto", overscrollBehavior: overflows ? "contain" : "auto", padding: "18px 20px",
          boxSizing: "border-box", position: "relative",
          background: shown?.kind === "doc" && shown.status === "done" ? SURFACE : WHITE }}>
        {!shown ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 12, textAlign: "center" }}>
            <Mascot agent={agent} state={running ? "thinking" : "idle"} size={64} title="" />
            <p style={{ margin: 0, maxWidth: "40ch", fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.55 }}>
              {idle || `${name}'s searches and the pages it reads open here as it goes.`}
            </p>
          </div>
        ) : (
          <div key={`${shown.id}-${shown.status}`} className={shown.status === "done" && animate ? "as-load" : undefined}>
            {shown.kind === "search" && <SearchView shot={shown} readTab={readTab} onJump={jump} ink={ink} name={name} animate={animate}
              next={nextSearch} />}
            {shown.kind === "page" && <PageView shot={shown} name={name} ink={ink} from={fromSearch} onJump={jump} />}
            {shown.kind === "notes" && <NotesView shot={shown} ink={ink} name={name} />}
            {shown.kind === "compose" && <ComposeView shot={shown} ink={ink} animate={animate} />}
            {shown.kind === "doc" && <DocView shot={shown} name={name} isMobile={isMobile} />}
          </div>
        )}
      </div>
    </section>
  );
}
