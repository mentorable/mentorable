import { useEffect, useMemo, useRef, useState } from "react";
import Mascot from "../Mascot.jsx";
import { PixelStamp } from "../../ui/PixelIcons.jsx";
import { SR_ONLY } from "../../ui/kit.jsx";
import {
  BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_FAINT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../ui/tokens.js";
import { addressOf, openedUrls, tabLabel, tabSentence } from "./screenModel.js";

// The agent's screen: a browser window that shows what the agent is really
// looking at while it works on its own. Each tab is one thing that happened
// on the server (screen.py): a search with the results it got back, a page it
// opened with the start of what it read, the facts it kept, the draft it
// wrote, or the doc a student opened in Quill. Nothing here is staged: no tab
// exists until its event arrives, and a page only shows text that was read.
//
// Following along: the newest tab is shown as it opens. Picking an older tab
// pauses that, and "Back to live" (with how many tabs opened since) resumes.
// The tabs are a real tablist (arrow keys, Home, End). The checklist beside
// the screen stays the one live region, so this never talks over it.
//
// Motion: a page wipes in from the top when it loads, a search's query types
// itself into the box, and a draft writes itself out. All of it is off under
// reduced motion, where everything simply appears.

const CSS = `
@keyframes as-load { from { clip-path: inset(0 0 100% 0); opacity: .4; } to { clip-path: inset(0 0 0 0); opacity: 1; } }
@keyframes as-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }
@keyframes as-caret { 50% { opacity: 0; } }
@keyframes as-live { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
.as-load { animation: as-load .42s cubic-bezier(.16,1,.3,1) both; }
.as-bar { animation: as-bar 1.3s cubic-bezier(.65,0,.35,1) infinite; }
.as-caret { animation: as-caret 1s steps(1) infinite; }
.as-live { animation: as-live 1.2s steps(2, jump-none) infinite; }
.as-view { scrollbar-width: thin; scrollbar-color: ${BORDER} transparent; }
.as-view::-webkit-scrollbar { width: 10px; height: 10px; }
.as-view::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 10px; border: 3px solid ${WHITE}; }
.as-tabs { scrollbar-width: none; }
.as-tabs::-webkit-scrollbar { display: none; }
.as-tab:hover { background: ${WHITE}; }
.as-result:hover .as-result-title, .as-result:focus-visible .as-result-title { text-decoration: underline; text-underline-offset: 3px; }
.as-view ::selection { background: var(--as-select, #dbe4ff); }
@media (prefers-reduced-motion: reduce) {
  .as-load, .as-bar, .as-caret, .as-live { animation: none; }
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
const AGENT_NAMES = { beaker: "Beaker", talon: "Talon", quill: "Quill", poise: "Poise" };

/** Reveals `text` a few characters at a time, once, unless motion is reduced. */
function useTyped(text, { cps = 60, maxMs = 2600, key } = {}) {
  const [n, setN] = useState(() => (reduced() ? text.length : 0));
  useEffect(() => {
    if (reduced() || !text) { setN(text.length); return undefined; }
    setN(0);
    const step = Math.max(1, Math.ceil(text.length / Math.max(1, (maxMs / 1000) * 30)), Math.ceil(cps / 30));
    const t = setInterval(() => setN((v) => {
      if (v + step >= text.length) { clearInterval(t); return text.length; }
      return v + step;
    }), 33);
    return () => clearInterval(t);
  }, [key, text, cps, maxMs]); // eslint-disable-line react-hooks/exhaustive-deps
  return text.slice(0, n);
}

function ExternalLink({ href, children, style, className = "" }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${FOCUS_CLASS} ${className}`.trim()} style={style}>
      {children}<span style={SR_ONLY}> (opens in a new tab)</span>
    </a>
  );
}

// ── The views ────────────────────────────────────────────────────────────────

function Waiting({ children }) {
  return (
    <p style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.55 }}>{children}</p>
  );
}

function SearchView({ shot, opened, ink, name }) {
  const typed = useTyped(shot.query, { key: shot.id, maxMs: 900 });
  const typing = typed.length < shot.query.length;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 46, padding: "0 14px", boxSizing: "border-box",
        border: `1px solid ${BORDER}`, borderRadius: RADIUS.pill, background: WHITE, color: TEXT_FAINT, maxWidth: 620 }}>
        <PixelStamp kind="search" size={16} />
        <span style={{ fontSize: "1rem", fontWeight: 600, color: TEXT, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap" }}>
          {typed}
          {(typing || shot.status === "active") && (
            <span aria-hidden="true" className="as-caret" style={{ display: "inline-block", width: 2, height: "1.05em",
              marginLeft: 1, verticalAlign: "-0.15em", background: ink.text }} />
          )}
        </span>
      </div>

      <div style={{ marginTop: 18 }}>
        {shot.status === "active" ? (
          <div aria-hidden="true" style={{ display: "grid", gap: 16 }}>
            {[0.92, 0.74, 0.84].map((w, i) => (
              <div key={i} style={{ display: "grid", gap: 7 }}>
                <span style={{ width: 120, height: 10, borderRadius: RADIUS.pill, background: SURFACE, border: `1px solid ${BORDER}` }} />
                <span style={{ width: `${w * 100}%`, maxWidth: 520, height: 14, borderRadius: RADIUS.pill, background: ink.softer }} />
                <span style={{ width: `${w * 88}%`, maxWidth: 480, height: 10, borderRadius: RADIUS.pill, background: SURFACE, border: `1px solid ${BORDER}` }} />
              </div>
            ))}
          </div>
        ) : shot.status === "failed" ? (
          <Waiting>That search didn't go through. {name} carried on with the others.</Waiting>
        ) : shot.results.length === 0 ? (
          <Waiting>Nothing came back for this one, so {name} tried another way.</Waiting>
        ) : (
          <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 16 }}>
            {shot.results.map((r) => {
              const read = opened.has(r.url);
              return (
                <li key={r.url} style={{ minWidth: 0 }}>
                  <ExternalLink href={r.url} className="as-result" style={{ display: "block", textDecoration: "none",
                    borderRadius: 8, maxWidth: 620 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED }}>
                      <span aria-hidden="true" style={{ width: 18, height: 18, borderRadius: 5, background: ink.softer, color: ink.onSoft,
                        display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.9rem", fontWeight: 800,
                        lineHeight: 1, flexShrink: 0 }}>{(r.domain || "?")[0].toUpperCase()}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.domain}</span>
                      {read && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, marginLeft: 2, padding: "1px 8px",
                          borderRadius: RADIUS.pill, background: ink.softer, border: `1px solid ${ink.soft}`, color: ink.onSoft,
                          fontSize: "0.9rem", fontWeight: 700, whiteSpace: "nowrap" }}>
                          <PixelStamp kind="check" size={16} />{name} read this
                        </span>
                      )}
                    </span>
                    <span className="as-result-title" style={{ display: "block", marginTop: 3, fontSize: "1.05rem", fontWeight: 700,
                      color: ink.text, lineHeight: 1.35, overflowWrap: "anywhere" }}>{r.title}</span>
                    {r.snippet && (
                      <span style={{ display: "block", marginTop: 3, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MID,
                        lineHeight: 1.5 }}>{r.snippet}</span>
                    )}
                  </ExternalLink>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function PageView({ shot, name }) {
  if (shot.status === "active") {
    return <Waiting>Opening {shot.domain}. {name} reads the page itself, not just the search result.</Waiting>;
  }
  if (shot.status === "failed") {
    return (
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span aria-hidden="true" style={{ color: TEXT_FAINT, display: "flex", paddingTop: 3 }}><PixelStamp kind="cross" size={16} /></span>
        <Waiting>{shot.domain} wouldn't open, or had nothing to read. That happens, and {name} moved on to the next page.</Waiting>
      </div>
    );
  }
  return (
    <article style={{ maxWidth: "62ch" }}>
      <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 800, color: TEXT, lineHeight: 1.3, letterSpacing: "-0.01em",
        overflowWrap: "anywhere" }}>{shot.title || shot.domain}</h3>
      <p style={{ margin: "4px 0 0", fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED }}>{shot.domain}</p>
      <p style={{ margin: "14px 0 0", fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.7, overflowWrap: "anywhere" }}>
        {shot.excerpt || "This page had no text to show here."}
        {shot.excerpt && shot.excerpt.length >= 880 && <span aria-hidden="true" style={{ color: TEXT_MUTED }}> …</span>}
      </p>
      <p style={{ margin: "16px 0 0", paddingTop: 12, borderTop: `1px solid ${BORDER}`, fontSize: "0.9rem", fontWeight: 700,
        color: TEXT_MUTED, lineHeight: 1.5 }}>
        The start of what {name} read. <ExternalLink href={shot.url} style={{ color: "inherit" }}>Open the whole page</ExternalLink>
      </p>
    </article>
  );
}

function NotesView({ shot, ink }) {
  return (
    <div style={{ maxWidth: "62ch" }}>
      <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800, color: TEXT, lineHeight: 1.3 }}>{shot.title || "What checked out"}</h3>
      <p style={{ margin: "4px 0 14px", fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 }}>
        Each fact was found on the page it links to. Anything that wasn't, was dropped.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12 }}>
        {shot.notes.map((n, i) => (
          <li key={i} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr)", gap: 10, alignItems: "start" }}>
            <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 6, background: ink.softer, color: ink.onSoft,
              display: "flex", alignItems: "center", justifyContent: "center" }}><PixelStamp kind="check" size={16} /></span>
            <span style={{ fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.5 }}>
              {n.text}
              {n.url && (
                <> <ExternalLink href={n.url} style={{ color: ink.text, fontSize: "0.9rem", fontWeight: 700, whiteSpace: "nowrap" }}>
                  {n.domain}
                </ExternalLink></>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComposeView({ shot, ink }) {
  const body = useTyped(shot.body, { key: shot.id, maxMs: 2600 });
  const writing = body.length < shot.body.length;
  const row = { display: "grid", gridTemplateColumns: "72px minmax(0,1fr)", gap: 8, padding: "9px 0",
    borderBottom: `1px solid ${BORDER}`, fontSize: "1rem", lineHeight: 1.4 };
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={row}><span style={{ fontWeight: 700, color: TEXT_MUTED }}>To</span>
        <span style={{ fontWeight: 600, color: TEXT, overflowWrap: "anywhere" }}>{shot.to || "You'll add an address"}</span></div>
      <div style={row}><span style={{ fontWeight: 700, color: TEXT_MUTED }}>Subject</span>
        <span style={{ fontWeight: 700, color: TEXT, overflowWrap: "anywhere" }}>{shot.subject}</span></div>
      <p style={{ margin: "14px 0 0", whiteSpace: "pre-wrap", fontSize: "1rem", fontWeight: 500, color: TEXT, lineHeight: 1.65,
        overflowWrap: "anywhere" }}>
        {body}
        {writing && <span aria-hidden="true" className="as-caret" style={{ display: "inline-block", width: 2, height: "1.05em",
          marginLeft: 1, verticalAlign: "-0.15em", background: ink.text }} />}
      </p>
      <p style={{ margin: "16px 0 0", display: "flex", gap: 8, alignItems: "flex-start", fontSize: "0.9rem", fontWeight: 700,
        color: TEXT_MUTED, lineHeight: 1.5 }}>
        <span aria-hidden="true" style={{ display: "flex", paddingTop: 2, flexShrink: 0 }}><PixelStamp kind="lock" size={16} /></span>
        Not sent. It waits on your board for you to read, change and send yourself.
      </p>
    </div>
  );
}

function DocView({ shot, name }) {
  if (shot.status === "active") return <Waiting>Opening your doc. {name} only reads it; nothing in it changes.</Waiting>;
  if (shot.status === "failed") return <Waiting>{name} couldn't open that doc.</Waiting>;
  const paras = shot.text.split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div style={{ background: SURFACE, margin: "-18px -20px", padding: "22px 20px", minHeight: "100%", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 4,
        padding: "32px clamp(18px, 5vw, 44px)", boxSizing: "border-box" }}>
        {shot.title && (
          <h3 style={{ margin: "0 0 14px", fontSize: "1.3rem", fontWeight: 800, color: TEXT, lineHeight: 1.3, overflowWrap: "anywhere" }}>
            {shot.title}
          </h3>
        )}
        {paras.slice(0, 60).map((p, i) => (
          <p key={i} style={{ margin: i ? "12px 0 0" : 0, fontSize: "1rem", fontWeight: 500, color: TEXT, lineHeight: 1.7,
            overflowWrap: "anywhere" }}>{p}</p>
        ))}
      </div>
    </div>
  );
}

// ── The window ───────────────────────────────────────────────────────────────

function TabIcon({ shot, ink }) {
  if (shot.status === "active") {
    return <span className="as-live" style={{ display: "flex", color: ink.text }}><PixelStamp kind="sparkle" size={16} /></span>;
  }
  if (shot.status === "failed") return <span style={{ display: "flex", color: TEXT_FAINT }}><PixelStamp kind="cross" size={16} /></span>;
  return <span style={{ display: "flex", color: TEXT_MUTED }}><PixelStamp kind={STAMP[shot.kind]} size={16} /></span>;
}

function LivePill({ running, ink }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "3px 10px", borderRadius: RADIUS.pill,
      background: running ? ink.softer : WHITE, border: `1px solid ${running ? ink.soft : BORDER}`,
      color: running ? ink.onSoft : TEXT_MUTED, fontSize: "0.9rem", fontWeight: 800, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" className={running ? "as-live" : undefined}
        style={{ width: 8, height: 8, background: running ? ink.text : TEXT_FAINT }} />
      {running ? "Live" : "Finished"}
    </span>
  );
}

/**
 * shots:   the tabs, from mergeScreen
 * agent:   "beaker" | "talon" | "quill", for the mascot and the words
 * running: whether the agent is still working
 * idle:    what the empty screen says before the first tab opens
 */
export default function AgentScreen({ shots, agent = "beaker", running = false, isMobile = false, height, idle, style }) {
  const ink = useAgentInk();
  const name = AGENT_NAMES[agent] || "The agent";
  const [pick, setPick] = useState(null);
  const seenAtPick = useRef(0);
  const tabRefs = useRef(new Map());
  const stripRef = useRef(null);
  const baseId = useMemo(() => `as-${Math.random().toString(36).slice(2, 8)}`, []);

  const newest = shots.length ? shots[shots.length - 1] : null;
  const shown = (pick && shots.find((s) => s.id === pick)) || newest;
  const following = !pick || !shots.some((s) => s.id === pick);
  const since = following ? 0 : shots.filter((s) => s.seq > seenAtPick.current).length;
  const opened = useMemo(() => openedUrls(shots), [shots]);
  const viewHeight = height || (isMobile ? 300 : 360);

  // Keep the shown tab in view on the strip.
  useEffect(() => {
    const el = shown && tabRefs.current.get(shown.id);
    if (el && stripRef.current) {
      const strip = stripRef.current;
      const left = el.offsetLeft - 8;
      const right = el.offsetLeft + el.offsetWidth + 8;
      if (left < strip.scrollLeft) strip.scrollTo({ left, behavior: reduced() ? "auto" : "smooth" });
      else if (right > strip.scrollLeft + strip.clientWidth) {
        strip.scrollTo({ left: right - strip.clientWidth, behavior: reduced() ? "auto" : "smooth" });
      }
    }
  }, [shown?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id, focus = false) => {
    if (newest && id === newest.id && running) { setPick(null); }
    else { setPick(id); seenAtPick.current = newest?.seq || 0; }
    if (focus) tabRefs.current.get(id)?.focus();
  };
  const onKey = (e) => {
    const at = shots.findIndex((s) => s.id === shown?.id);
    const go = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: shots.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    const target = shots[Math.max(0, Math.min(shots.length - 1, go))];
    if (target) choose(target.id, true);
  };

  const address = shown ? addressOf(shown, name) : { url: "", text: "" };
  const loading = shown?.status === "active";
  const caption = shown ? tabSentence(shown, name) : (running ? `${name} is getting started.` : "");

  return (
    <section aria-label={`${name}'s screen`} style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card,
      overflow: "hidden", fontFamily: SANS, minWidth: 0, "--as-select": ink.soft, ...style }}>
      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: SURFACE,
        borderBottom: `1px solid ${BORDER}`, minWidth: 0 }}>
        <Mascot agent={agent} state={running ? "flying" : "idle"} size={28} title="" />
        <span style={{ fontSize: "1rem", fontWeight: 800, color: TEXT, whiteSpace: "nowrap" }}>{name}'s screen</span>
        <LivePill running={running} ink={ink} />
        <span style={{ flex: 1 }} />
        {since > 0 && running && (
          <button type="button" onClick={() => setPick(null)} className={FOCUS_CLASS}
            style={{ minHeight: 36, padding: "4px 12px", border: `1px solid ${ink.soft}`, borderRadius: RADIUS.pill,
              background: ink.softer, color: ink.onSoft, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800,
              cursor: "pointer", whiteSpace: "nowrap" }}>
            Back to live{since ? ` (${since} new)` : ""}
          </button>
        )}
        {!isMobile && shots.length > 0 && !(since > 0 && running) && (
          <span style={{ fontSize: "0.9rem", fontWeight: 700, color: TEXT_MUTED, whiteSpace: "nowrap" }}>
            {shots.length} {shots.length === 1 ? "tab" : "tabs"}
          </span>
        )}
      </div>

      {/* Tabs */}
      {shots.length > 0 && (
        <div ref={stripRef} role="tablist" aria-label={`What ${name} opened`} onKeyDown={onKey} className="as-tabs"
          style={{ display: "flex", gap: 4, padding: "8px 10px 0", background: SURFACE, overflowX: "auto",
            borderBottom: `1px solid ${BORDER}` }}>
          {shots.map((s) => {
            const on = s.id === shown?.id;
            return (
              <button key={s.id} type="button" role="tab" id={`${baseId}-tab-${s.id}`} aria-selected={on}
                aria-controls={`${baseId}-panel`} tabIndex={on ? 0 : -1}
                ref={(el) => { if (el) tabRefs.current.set(s.id, el); else tabRefs.current.delete(s.id); }}
                onClick={() => choose(s.id)} className={`as-tab ${FOCUS_CLASS}`}
                style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, maxWidth: isMobile ? 170 : 220,
                  minHeight: 40, padding: "0 12px", marginBottom: -1, border: `1px solid ${on ? BORDER : "transparent"}`,
                  borderBottom: `1px solid ${on ? WHITE : "transparent"}`, borderRadius: "10px 10px 0 0",
                  background: on ? WHITE : "transparent", color: on ? TEXT : TEXT_MUTED, fontFamily: SANS,
                  fontSize: "0.9rem", fontWeight: on ? 800 : 700, cursor: "pointer" }}>
                <TabIcon shot={s} ink={ink} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tabLabel(s, name)}</span>
                <span style={SR_ONLY}>{s.status === "active" ? ", opening" : s.status === "failed" ? ", didn't work" : ""}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Address bar */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
        borderBottom: `1px solid ${BORDER}`, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "0 12px",
          borderRadius: RADIUS.pill, background: SURFACE, border: `1px solid ${BORDER}`, color: TEXT_FAINT }}>
          <span aria-hidden="true" style={{ display: "flex", flexShrink: 0 }}>
            <PixelStamp kind={address.url ? "lock" : shown ? STAMP[shown.kind] : "sparkle"} size={16} />
          </span>
          <span style={{ fontSize: "0.9rem", fontWeight: 700, color: TEXT_MID, minWidth: 0, overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span style={SR_ONLY}>Address: </span>{address.text || `${name} hasn't opened anything yet`}
          </span>
        </div>
        {address.url && shown?.status === "done" && (
          <ExternalLink href={address.url} style={{ display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 6px",
            color: ink.text, fontSize: "0.9rem", fontWeight: 800, whiteSpace: "nowrap", borderRadius: 8 }}>
            Open
          </ExternalLink>
        )}
        {loading && (
          <span aria-hidden="true" style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2, overflow: "hidden" }}>
            <span className="as-bar" style={{ display: "block", width: "40%", height: "100%", background: ink.ring }} />
          </span>
        )}
      </div>

      {/* The page */}
      <div id={`${baseId}-panel`} role={shots.length ? "tabpanel" : undefined}
        aria-labelledby={shown ? `${baseId}-tab-${shown.id}` : undefined} tabIndex={0}
        className={`as-view ${FOCUS_CLASS}`}
        style={{ height: viewHeight, overflowY: "auto", padding: "18px 20px", boxSizing: "border-box", position: "relative" }}>
        {!shown ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 12, textAlign: "center" }}>
            <Mascot agent={agent} state={running ? "thinking" : "idle"} size={64} title="" />
            <p style={{ margin: 0, maxWidth: "40ch", fontSize: "1rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.55 }}>
              {idle || `${name}'s searches and the pages it reads open here as it goes.`}
            </p>
          </div>
        ) : (
          <div key={`${shown.id}-${shown.status}`} className={shown.status === "done" ? "as-load" : undefined}>
            {shown.kind === "search" && <SearchView shot={shown} opened={opened} ink={ink} name={name} />}
            {shown.kind === "page" && <PageView shot={shown} name={name} />}
            {shown.kind === "notes" && <NotesView shot={shown} ink={ink} />}
            {shown.kind === "compose" && <ComposeView shot={shown} ink={ink} />}
            {shown.kind === "doc" && <DocView shot={shown} name={name} />}
          </div>
        )}
      </div>

      {/* What this tab is, in a sentence */}
      {caption && (
        <p style={{ margin: 0, padding: "10px 16px", borderTop: `1px solid ${BORDER}`, background: SURFACE, fontSize: "0.9rem",
          fontWeight: 700, color: TEXT_MUTED, lineHeight: 1.45, overflowWrap: "anywhere" }}>
          {!following && running && <span style={{ color: TEXT }}>Looking back. </span>}
          {caption}
        </p>
      )}
    </section>
  );
}
