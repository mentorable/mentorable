import { Fragment, useLayoutEffect, useRef } from "react";
import { lighten } from "../../../lib/theme.js";
import { C, SANS, seg, streamBlocks } from "../kit.js";
import { CHAT, LIBRARY_ROW } from "../data.js";

// The Chat screen, recreated from ChatPage.jsx (Message and the record-edit
// toast are local to that page): the student's bubble, the advisor's bubble
// with the "m" avatar, the streaming look (a 2px accent sweep along the top
// edge and a blinking caret), the hairline footer with the time and Copy,
// and the toast.
//
// The hero shows it as a card: a crop of the conversation, the 48px top bar
// and the message list, no input.
//
// A pure function of (step, t). Step 0 asks and answers: the dots, then
// TURN1 and TURN2's first paragraph stream, then each later block lands
// whole. Step 1 is the record update: the toast and the footer.
// The list is scrolled to the newest text, as the app does, through its
// own scroller's scrollTop.

const INK = "#141413";
const ACCENT = C.accent;
const ACCENT_LIGHT = lighten(C.accent, 0.35);   // the app's gradient end
const FAINT = "#6a6760";
const TIME = "04:12 PM";
const APP_BG = "#F5F5F5";

// The app's faint accent dot grid behind the conversation.
const DOT_GRID = {
  background: APP_BG,
  backgroundImage: "radial-gradient(circle, rgba(29,78,216,0.05) 1px, transparent 1px)",
  backgroundSize: "32px 32px",
};

const CHAT_CSS = `
@keyframes lp-chat-sweep { 0% { transform: translateX(-100%); opacity: .6; } 60% { transform: translateX(0); opacity: 1; } 100% { transform: translateX(100%); opacity: 0; } }
@keyframes lp-chat-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes lp-chat-dot { 0%, 100% { transform: translateY(0); opacity: .3; } 50% { transform: translateY(-4px); opacity: .8; } }
@keyframes lp-chat-toast { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.lp-chat-sweep { animation: lp-chat-sweep 1.8s ease-in-out infinite; }
.lp-chat-caret { animation: lp-chat-blink 0.7s steps(1, end) infinite; }
.lp-chat-dot { animation: lp-chat-dot 0.8s ease-in-out infinite; }
.lp-chat-toast { animation: lp-chat-toast 250ms ease; }
@media (prefers-reduced-motion: reduce) { .lp-chat-sweep, .lp-chat-caret, .lp-chat-dot, .lp-chat-toast { animation: none; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-lp-chat]")) {
  const el = document.createElement("style");
  el.dataset.lpChat = "";
  el.textContent = CHAT_CSS;
  document.head.appendChild(el);
}

// ─── The reply, as blocks ────────────────────────────────────────────────────

// TURN1, then TURN2's paragraphs; a paragraph of bullets becomes one block
// per bullet, so each lands on its own. The app joins the two turns with a
// blank line (TURN_SEPARATOR), which its renderer shows as a 6px spacer.
function toBlocks(turn1, turn2) {
  const out = [{ kind: "p", text: String(turn1 || "") }];
  for (const para of String(turn2 || "").split(/\n\s*\n/)) {
    const lines = para.split("\n").filter(Boolean);
    if (lines.length && lines.every((l) => /^[-*+] /.test(l))) {
      lines.forEach((l) => out.push({ kind: "li", text: l.replace(/^[-*+] /, "") }));
    } else if (para.trim()) {
      out.push({ kind: "p", text: para });
    }
  }
  return out;
}
const BLOCKS = toBlocks(CHAT.turn1, CHAT.turn2);
const TEXTS = BLOCKS.map((b) => b.text);

/** Bold only (the reply uses nothing else). An unclosed ** while streaming
 *  stays bold to the end, and a lone trailing asterisk is held back. */
function Inline({ text }) {
  let s = String(text ?? "");
  if (/(^|[^*])\*$/.test(s)) s = s.slice(0, -1);
  const parts = s.split("**");
  return (
    <>
      {parts.map((part, i) => (i % 2
        ? <strong key={i} style={{ fontWeight: 700, color: INK }}>{part}</strong>
        : <Fragment key={i}>{part}</Fragment>))}
    </>
  );
}

const P = { fontFamily: SANS, fontSize: 14, color: INK, lineHeight: 1.7, margin: 0 };
const LI = { fontFamily: SANS, fontSize: 14, color: INK, lineHeight: 1.65, listStyleType: "disc" };

function Reply({ shown, caret, anim = true }) {
  const groups = [];
  shown.forEach((text, i) => {
    const kind = BLOCKS[i]?.kind || "p";
    const last = groups[groups.length - 1];
    if (kind === "li" && last && last.kind === "ul") last.items.push(text);
    else if (kind === "li") groups.push({ kind: "ul", items: [text] });
    else groups.push({ kind: "p", text });
  });
  const caretEl = caret ? (
    <span className={anim ? "lp-chat-caret" : undefined} style={{ display: "inline-block", width: 2, height: "0.9em", background: ACCENT, marginLeft: 2,
      borderRadius: 1, verticalAlign: "text-bottom" }} />
  ) : null;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {groups.map((g, gi) => {
        const isLast = gi === groups.length - 1;
        return (
          <Fragment key={gi}>
            {gi > 0 && <div style={{ height: 6 }} />}
            {g.kind === "ul" ? (
              <ul style={{ paddingLeft: 18, margin: "4px 0", display: "flex", flexDirection: "column", gap: 3 }}>
                {g.items.map((item, ii) => (
                  <li key={ii} style={LI}><Inline text={item} />{isLast && ii === g.items.length - 1 ? caretEl : null}</li>
                ))}
              </ul>
            ) : (
              <p style={P}><Inline text={g.text} />{isLast ? caretEl : null}</p>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

const IconCopy = ({ size = 11, color = FAINT }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/** The "m" avatar: the app's accent to accent-light gradient. */
function Avatar({ size = 28 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_LIGHT})`,
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 8px rgba(20,20,19,0.14)" }}>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: size * 0.42, color: "#fff", letterSpacing: "-0.04em", lineHeight: 1, userSelect: "none" }}>m</span>
    </div>
  );
}

function TopBar() {
  return (
    <div style={{ height: 48, flexShrink: 0, paddingLeft: 16, paddingRight: 16, background: "rgba(248,250,255,0.92)",
      borderBottom: "1px solid rgba(29,78,216,0.1)", display: "flex", alignItems: "center", gap: 10, zIndex: 5, position: "relative" }}>
      <Avatar size={24} />
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 14, color: INK, letterSpacing: "-0.03em" }}>Mentorable Chat</span>
    </div>
  );
}

function Dots({ anim = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0" }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={anim ? "lp-chat-dot" : undefined} style={{ width: 6, height: 6, borderRadius: "50%", background: FAINT, display: "block",
          animationDelay: `${i * 0.16}s` }} />
      ))}
    </div>
  );
}

function UserMsg({ padLeft }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20, paddingLeft: padLeft }}>
      <div style={{ background: ACCENT, borderRadius: "16px 16px 3px 16px", padding: "13px 18px", maxWidth: 520, boxShadow: "0 2px 10px rgba(20,20,19,0.12)" }}>
        <p style={{ fontFamily: SANS, fontSize: 15.5, color: "#fff", lineHeight: 1.65, margin: 0 }}>{CHAT.question}</p>
        <p style={{ fontFamily: SANS, fontSize: 10, color: "rgba(255,255,255,0.5)", margin: "5px 0 0", textAlign: "right" }}>{TIME}</p>
      </div>
    </div>
  );
}

function AdvisorMsg({ padRight, shown, streaming, finished, anim = true }) {
  return (
    <div style={{ display: "flex", gap: 11, marginBottom: 20, paddingRight: padRight, alignItems: "flex-start" }}>
      <Avatar size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ position: "relative", overflow: "hidden", background: "#fff", borderRadius: "3px 16px 16px 16px", padding: "16px 18px",
          border: `1px solid rgba(29,78,216,${streaming ? 0.25 : 0.1})`, maxWidth: 600,
          boxShadow: "0 2px 12px rgba(20,20,19,0.05), 0 1px 4px rgba(15,23,42,0.04)" }}>
          {streaming && (
            <span className={anim ? "lp-chat-sweep" : undefined} aria-hidden="true" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2,
              background: `linear-gradient(90deg, transparent, ${ACCENT_LIGHT}, ${ACCENT}, transparent)`, borderRadius: "2px 2px 0 0" }} />
          )}
          {shown.length ? <Reply shown={shown} caret={streaming} anim={anim} /> : <Dots anim={anim} />}
          {finished && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
              <p style={{ fontFamily: SANS, fontSize: 10, color: FAINT, margin: 0 }}>{TIME}</p>
              <span style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, border: "1px solid #f1f5f9",
                color: FAINT, fontFamily: SANS, fontSize: 11, fontWeight: 600 }}>
                <IconCopy />
                Copy
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The record-edit notice, as the app shows it after a tool call (no shadow here). */
function Toast({ style }) {
  return (
    <div className="lp-chat-toast" style={{ position: "absolute", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
      background: ACCENT, color: "#fff", borderRadius: 12, fontFamily: SANS, fontSize: 14, lineHeight: 1.4, zIndex: 20, boxSizing: "border-box", ...style }}>
      <span style={{ fontSize: 16, lineHeight: 1 }}>✓</span>
      <span>Added <strong style={{ fontWeight: 700 }}>{LIBRARY_ROW.title}</strong> in your Portfolio</span>
    </div>
  );
}

// ─── Beats ───────────────────────────────────────────────────────────────────

// 0 to .1 dots / .1 to .55 the first two blocks stream / .55 to 1 the rest land.
// The streaming look (sweep and caret) lasts until the last block has landed
// (t = 1 is the step's finished state: the footer shows). Step 1 (and after):
// everything shown, the footer, the toast.
function beats(step, t) {
  if (step >= 1) return { u: 1, streaming: false, finished: true, toast: true };
  if (t < 0.1) return { u: 0, streaming: false, finished: false, toast: false };
  const u = t < 0.55 ? 0.5 * seg(t, 0.1, 0.55) : 0.5 + 0.5 * seg(t, 0.55, 1);
  const finished = u >= 1;
  return { u, streaming: !finished, finished, toast: false };
}

// ─── The screen ──────────────────────────────────────────────────────────────

export default function ChatScreen({ step = 0, t = 0, layout = "desktop", still = false }) {
  const mobile = layout === "mobile";
  const b = beats(step, t);
  // Settled or off screen: no sweep, caret blink or dot bounce (the Mockup's
  // lp-still pauses them as well; this keeps the screen honest on its own).
  const anim = !still;
  const { shown } = streamBlocks(TEXTS, b.u, { streamed: 2 });
  const scroller = useRef(null);

  // Scrolled to the newest text, like the app (its own scroller only).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  });
  // A font that finishes loading after the last redraw changes the text's
  // height without a render: follow it to the bottom too.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(() => { el.scrollTop = el.scrollHeight; });
    Array.from(el.children).forEach((child) => watch.observe(child));
    return () => watch.disconnect();
  }, []);

  return (
    <div style={{ width: "100%", height: "100%", borderRadius: 16, border: "1px solid rgba(20,20,19,0.08)",
      boxSizing: "border-box", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", ...DOT_GRID }}>
      <TopBar />
      <div ref={scroller} style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: mobile ? "16px 14px 16px" : "20px 20px 20px" }}>
        <UserMsg padLeft={mobile ? 32 : 64} />
        <AdvisorMsg padRight={mobile ? 24 : 48} shown={shown} streaming={b.streaming} finished={b.finished} anim={anim} />
      </div>
      {b.toast && <Toast style={{ right: 16, bottom: 16, maxWidth: "calc(100% - 32px)" }} />}
    </div>
  );
}
