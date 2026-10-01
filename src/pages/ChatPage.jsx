import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase.js";
import { streamChatResponse } from "../lib/mentora.js";
import { getCache, setCache, getKnownUserId, setKnownUserId } from "../lib/cache.js";
import { getActiveChat, setActiveChat, isChatGenerating, markChatGenerating, clearChatGenerating } from "../lib/liveState.js";
import { fetchUsage, LIMITS } from "../lib/usage.js";
import LimitModal from "../components/common/LimitModal.jsx";
import { SIDEBAR_WIDTH } from "../components/common/Sidebar.jsx";
import Drawer from "../components/common/Drawer.jsx";
import { useIsMobile } from "../hooks/useIsMobile.js";
import { useQuest } from "../lib/QuestContext.jsx";
import { runResearch, summarizeResearchForHistory, ResearchLimitError } from "../lib/research.js";
import { ResultCard, SourcesSection } from "../components/common/ResearchResults.jsx";
import {
  AMBER_TEXT, BG, BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, ringVar, useAgentInk,
} from "../components/ui/tokens.js";
import { Button, INPUT_CLASS, Notice, SR_ONLY, StampTile, Tip, Toast, inputStyle } from "../components/ui/kit.jsx";
import { PixelStamp } from "../components/ui/PixelIcons.jsx";

// The advisor, on the app's shared kit: a calm shell (white cards, 1px warm
// borders, flat kit buttons) with its character in the pixel chat stamp, the
// dialog-box name tab on each reply, and the guide bubble on the welcome.

const HISTORY_W = 252;

const SUGGESTIONS = [
  { label: "What should I work on this week?" },
  { label: "How do I make my application stand out?" },
  { label: "What skills should I be building right now?" },
  { label: "Help me think through my career options" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupChatsByDate(sessions) {
  const now = new Date();
  const result = { Today: [], Yesterday: [], "This Week": [], "This Month": [], Older: [] };
  sessions.forEach((s) => {
    const diffDays = (now - new Date(s.updated_at)) / 86400000;
    if (diffDays < 1)       result["Today"].push(s);
    else if (diffDays < 2)  result["Yesterday"].push(s);
    else if (diffDays < 7)  result["This Week"].push(s);
    else if (diffDays < 30) result["This Month"].push(s);
    else                    result["Older"].push(s);
  });
  return result;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)     return "Just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)}d ago`;
}

function sessionTitle(session) {
  if (session.title) return session.title;
  const firstUser = session.messages?.find((m) => m.role === "user");
  return firstUser?.content?.split("\n")[0]?.slice(0, 60) || "New conversation";
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const IconSend  = ({ size = 16, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M22 2L11 13" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconPlus  = ({ size = 14, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
  </svg>
);
const IconTrash = ({ size = 13, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
  </svg>
);
const IconEdit  = ({ size = 13, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);
const IconCheck = ({ size = 12, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconCopy  = ({ size = 13, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const IconSearch = ({ size = 13, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);

// ─── Streaming visualization ──────────────────────────────────────────────────

// A thin accent line sweeps the top of a reply while it is still arriving, in
// its own clipped track so the card itself can let its name tab poke out.
// The colour comes in through --chat-accent, set from useAgentInk on the card.
const STREAMING_CSS = `
@keyframes streamSweep {
  0%   { transform: translateX(-100%); opacity: 0.6; }
  60%  { transform: translateX(0%);    opacity: 1; }
  100% { transform: translateX(100%);  opacity: 0; }
}
.stream-sweep-track { position: absolute; top: 0; left: ${RADIUS.card}px; right: ${RADIUS.card}px; height: 2px; overflow: hidden; pointer-events: none; }
.stream-sweep { display: block; height: 100%; background: linear-gradient(90deg, transparent, var(--chat-accent), transparent);
  animation: streamSweep 1.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .stream-sweep { animation: none; opacity: 0.6; } }
`;

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 0" }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{ y: [0, -4, 0], opacity: [0.35, 0.9, 0.35] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.16, ease: "easeInOut" }}
          style={{ width: 6, height: 6, borderRadius: "50%", background: TEXT_MUTED, flexShrink: 0 }}
        />
      ))}
    </div>
  );
}

// ─── Agent avatar ─────────────────────────────────────────────────────────────

function AgentAvatar({ size = 32 }) {
  return <StampTile kind="chat" size={size} />;
}

// The pixel name tab the game dialog box carries ("Advisor", "Research"),
// sitting on the top edge of a calm message card. Read out to screen readers
// as "Advisor says:" the way SpeechBubble does.
function NameTab({ name, icon }) {
  const ink = useAgentInk();
  return (
    <>
      <span style={SR_ONLY}>{name} says: </span>
      <span aria-hidden="true" style={{ position: "absolute", top: -11, left: 16, display: "inline-flex", alignItems: "center",
        gap: 5, padding: "2px 8px", background: ink.soft, color: ink.onSoft, fontFamily: SANS, fontSize: "0.9rem",
        fontWeight: 800, letterSpacing: "0.01em", lineHeight: 1.3, whiteSpace: "nowrap",
        boxShadow: `0 -2px 0 ${TEXT}, 0 2px 0 ${TEXT}, -2px 0 0 ${TEXT}, 2px 0 0 ${TEXT}` }}>
        {icon}
        {name}
      </span>
    </>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function Inline({ text, color = TEXT }) {
  const tokens = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ t: "text", v: text.slice(last, m.index) });
    if (m[0].startsWith("**"))    tokens.push({ t: "bold",   v: m[2] });
    else if (m[0].startsWith("`")) tokens.push({ t: "code",  v: m[4] });
    else                           tokens.push({ t: "italic", v: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ t: "text", v: text.slice(last) });
  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.t === "bold")   return <strong key={i} style={{ fontWeight: 700, color }}>{tok.v}</strong>;
        if (tok.t === "italic") return <em key={i} style={{ fontStyle: "italic" }}>{tok.v}</em>;
        if (tok.t === "code")   return <code key={i} style={{ fontFamily: "monospace", fontSize: "0.9rem", background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "1px 5px", color: TEXT_MID }}>{tok.v}</code>;
        return <span key={i}>{tok.v}</span>;
      })}
    </>
  );
}

// GFM-style pipe tables, e.g. "| # | Program | Key Detail |" over a
// "|---|---|---|" separator row.
function isTableRow(line) {
  return /\|/.test(line) && line.trim() !== "";
}
function isTableSeparator(line) {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}
function splitTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

const BODY = { fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.7 };

function MarkdownRenderer({ text, streaming = false }) {
  const ink = useAgentInk();
  const lines = text.split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^### /.test(line)) { blocks.push({ type: "h3", text: line.slice(4) }); i++; continue; }
    if (/^## /.test(line))  { blocks.push({ type: "h2", text: line.slice(3) }); i++; continue; }
    if (/^# /.test(line))   { blocks.push({ type: "h1", text: line.slice(2) }); i++; continue; }
    if (/^---+$/.test(line.trim())) { blocks.push({ type: "hr" }); i++; continue; }
    if (/^[-*+] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) { items.push(lines[i].replace(/^[-*+] /, "")); i++; }
      blocks.push({ type: "ul", items }); continue;
    }
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      blocks.push({ type: "ol", items }); continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) { rows.push(splitTableRow(lines[i])); i++; }
      blocks.push({ type: "table", header, rows }); continue;
    }
    if (line.trim() === "") { blocks.push({ type: "spacer" }); i++; continue; }
    blocks.push({ type: "p", text: line }); i++;
  }

  const lastBlockIdx = blocks.length - 1;
  const cursor = streaming ? (
    <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.7, repeat: Infinity }}
      style={{ display: "inline-block", width: 2, height: "0.9em", background: ink.text, marginLeft: 2, borderRadius: 1, verticalAlign: "text-bottom" }} />
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {blocks.map((block, bi) => {
        const isLast = bi === lastBlockIdx;
        const cur = isLast ? cursor : null;

        if (block.type === "spacer") return <div key={bi} style={{ height: 6 }} />;
        if (block.type === "hr")     return <hr key={bi} style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "10px 0" }} />;
        if (block.type === "h1")     return <p key={bi} style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.2rem", color: TEXT, lineHeight: 1.35, margin: "10px 0 4px" }}><Inline text={block.text}/>{cur}</p>;
        if (block.type === "h2")     return <p key={bi} style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.08rem", color: TEXT, lineHeight: 1.4,  margin: "8px 0 3px"  }}><Inline text={block.text}/>{cur}</p>;
        if (block.type === "h3")     return <p key={bi} style={{ fontFamily: SANS, fontWeight: 800, fontSize: "0.92rem", color: TEXT_MID, lineHeight: 1.4, margin: "8px 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}><Inline text={block.text} color={TEXT_MID}/>{cur}</p>;
        if (block.type === "ul")     return (
          <ul key={bi} style={{ paddingLeft: 20, margin: "4px 0", display: "flex", flexDirection: "column", gap: 3 }}>
            {block.items.map((item, ii) => (
              <li key={ii} style={{ ...BODY, lineHeight: 1.65, listStyleType: "disc" }}>
                <Inline text={item}/>{isLast && ii === block.items.length - 1 ? cursor : null}
              </li>
            ))}
          </ul>
        );
        if (block.type === "ol") return (
          <ol key={bi} style={{ paddingLeft: 20, margin: "4px 0", display: "flex", flexDirection: "column", gap: 3 }}>
            {block.items.map((item, ii) => (
              <li key={ii} style={{ ...BODY, lineHeight: 1.65 }}>
                <Inline text={item}/>{isLast && ii === block.items.length - 1 ? cursor : null}
              </li>
            ))}
          </ol>
        );
        if (block.type === "table") return (
          <div key={bi} style={{ overflowX: "auto", margin: "8px 0" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: SANS, fontSize: "0.95rem" }}>
              <thead>
                <tr>
                  {block.header.map((cell, ci) => (
                    <th key={ci} style={{ textAlign: "left", padding: "8px 12px", borderBottom: `1.5px solid ${BORDER}`, color: TEXT, fontWeight: 800, whiteSpace: "nowrap" }}>
                      <Inline text={cell}/>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ textAlign: "left", padding: "8px 12px", borderBottom: `1px solid ${BORDER}`, color: TEXT, lineHeight: 1.55, verticalAlign: "top" }}>
                        <Inline text={cell}/>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        return <p key={bi} style={{ ...BODY, margin: 0 }}><Inline text={block.text}/>{cur}</p>;
      })}
    </div>
  );
}

// ─── Typewriter hook ──────────────────────────────────────────────────────────

function useTypewriter(targetText, active) {
  const [displayed, setDisplayed] = useState(() => active ? "" : targetText);
  const posRef = useRef(active ? 0 : targetText.length);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!active) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      posRef.current = targetText.length;
      setDisplayed(targetText);
      return;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = () => {
      const pos = posRef.current;
      const len = targetText.length;
      if (pos < len) {
        const behind = len - pos;
        const step = behind > 40 ? 5 : behind > 15 ? 2 : 1;
        const next = Math.min(pos + step, len);
        posRef.current = next;
        setDisplayed(targetText.slice(0, next));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [targetText, active]);

  return displayed;
}

// ─── Message ──────────────────────────────────────────────────────────────────

const RESEARCHING_STEPS = ["Searching the web…", "Reading sources…", "Putting it together…"];

// The advisor's card: white, 1px warm border, the card radius with the corner
// nearest the avatar squared off, and room above it for the name tab.
const ADVISOR_CARD = {
  position: "relative", background: WHITE, border: `1px solid ${BORDER}`, borderRadius: `4px ${RADIUS.card}px ${RADIUS.card}px ${RADIUS.card}px`,
  padding: "20px 18px 14px", boxSizing: "border-box", minWidth: 0,
};

function ResearchingIndicator() {
  const ink = useAgentInk();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setStep((s) => (s + 1) % RESEARCHING_STEPS.length), 2200);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 14, height: 14, border: `2px solid ${ink.soft}`, borderTopColor: ink.text, borderRadius: "50%", animation: "spinner-rotate 0.8s linear infinite", flexShrink: 0 }} />
      <AnimatePresence mode="wait">
        <motion.span key={step} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}
          style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MID }}>
          {RESEARCHING_STEPS[step]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function ResearchMessage({ msg, isMobile = false }) {
  const ink = useAgentInk();
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: "flex", gap: 11, marginBottom: 22, paddingTop: 12, paddingRight: isMobile ? 0 : 40, alignItems: "flex-start" }}
    >
      {!isMobile && <AgentAvatar size={32} />}
      <div style={{ flex: 1, minWidth: 0, maxWidth: 640 }}>
        <div style={{ ...ADVISOR_CARD, background: ink.softer, borderColor: ink.soft }}>
          <NameTab name="Research" icon={<IconSearch size={12} color={ink.onSoft} />} />
          {msg.researching ? (
            <ResearchingIndicator />
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(msg.results || []).map((r, i) => <ResultCard key={r.url || i} result={r} index={i} />)}
              </div>
              <SourcesSection sources={msg.sources} />
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Message({ msg, isMobile = false }) {
  const ink = useAgentInk();
  const [copied, setCopied] = useState(false);
  const isUser      = msg.role === "user";
  const isStreaming  = Boolean(msg.streaming);
  const displayedText = useTypewriter(msg.content || "", isStreaming);

  const handleCopy = () => {
    navigator.clipboard?.writeText(msg.content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: "flex", justifyContent: "flex-end", marginBottom: 22, paddingLeft: isMobile ? 32 : 80 }}
      >
        <div style={{
          background: ink.softer,
          border: `1px solid ${ink.soft}`,
          borderRadius: `${RADIUS.card}px ${RADIUS.card}px 4px ${RADIUS.card}px`,
          padding: "12px 16px",
          maxWidth: 520,
          minWidth: 0,
        }}>
          <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT, lineHeight: 1.65, margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{msg.content}</p>
          {msg.time && <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: TEXT_MUTED, margin: "4px 0 0", textAlign: "right" }}>{msg.time}</p>}
        </div>
      </motion.div>
    );
  }

  if (msg.type === "research") {
    return <ResearchMessage msg={msg} isMobile={isMobile} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: "flex", gap: 11, marginBottom: 22, paddingTop: 12, paddingRight: isMobile ? 0 : 80, alignItems: "flex-start" }}
    >
      {!isMobile && <AgentAvatar size={32} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            ...ADVISOR_CARD,
            "--chat-accent": ink.accent,
            borderColor: isStreaming ? ink.soft : BORDER,
            maxWidth: 640,
          }}
        >
          {isStreaming && <span className="stream-sweep-track" aria-hidden="true"><span className="stream-sweep" /></span>}
          <NameTab name="Advisor" icon={<PixelStamp kind="chat" size={12} />} />
          {displayedText
            ? <MarkdownRenderer text={displayedText} streaming={isStreaming} />
            : <TypingIndicator />
          }
          {!isStreaming && msg.content && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10, paddingTop: 4, borderTop: `1px solid ${BORDER}` }}>
              <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: TEXT_MUTED, margin: 0 }}>{msg.time}</p>
              <Button kind="quiet" onClick={handleCopy}
                style={{ fontSize: "0.9rem", padding: "6px 10px", marginRight: -10, color: copied ? ink.text : TEXT_MUTED }}>
                {copied ? <IconCheck size={13} color={ink.text} /> : <IconCopy size={13} color={TEXT_MUTED} />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── InputBar ─────────────────────────────────────────────────────────────────

const MAX_INPUT = 2000;

// Strip control characters before sending to the API
function sanitizeChatInput(text) {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}

function InputBar({ onSend, busy, chatLimitReached, researchLimitReached, researchMode, onToggleResearch, isMobile = false, chatUsed = 0, researchUsed = 0 }) {
  const ink = useAgentInk();
  const [value, setValue] = useState("");
  const taRef = useRef(null);

  const autoResize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  };

  const limitReached = researchMode ? researchLimitReached : chatLimitReached;
  const disabled = busy || limitReached;

  const handleSend = () => {
    const sanitized = sanitizeChatInput(value);
    if (!sanitized || disabled) return;
    onSend(sanitized);
    setValue("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const canSend = value.trim() && !disabled && value.length <= MAX_INPUT;
  const nearLimit = value.length > MAX_INPUT * 0.85;
  const over = value.length > MAX_INPUT;

  return (
    <div style={{ padding: isMobile ? "10px 16px 14px" : "14px 28px 22px", flexShrink: 0, maxWidth: 880, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <textarea
          ref={taRef}
          className={INPUT_CLASS}
          value={value}
          onChange={(e) => { if (e.target.value.length <= MAX_INPUT + 50) setValue(e.target.value); autoResize(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={researchMode ? "Find scholarships, internships, programs…" : "Ask anything about your career…"}
          rows={1}
          style={{ ...inputStyle, flex: 1, minWidth: 0, resize: "none", maxHeight: 160, display: "block",
            borderColor: over ? DANGER : researchMode ? ink.text : BORDER }}
        />
        <button
          type="button"
          className={FOCUS_CLASS}
          onClick={onToggleResearch}
          disabled={researchLimitReached}
          aria-pressed={researchMode}
          aria-label={isMobile ? "Research" : undefined}
          title={researchLimitReached ? "No research queries remaining" : researchMode ? "Research mode on" : "Search the web for this"}
          style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, flexShrink: 0,
            minHeight: 46, minWidth: 46, padding: isMobile ? "0 12px" : "0 14px", borderRadius: RADIUS.pill, boxSizing: "border-box",
            border: `1.5px solid ${researchMode ? ink.text : BORDER}`,
            background: researchMode ? ink.softer : WHITE,
            color: researchMode ? ink.onSoft : TEXT_MID,
            cursor: researchLimitReached ? "not-allowed" : "pointer",
            opacity: researchLimitReached ? 0.55 : 1,
            fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
          }}
        >
          <IconSearch size={14} color={researchMode ? ink.onSoft : TEXT_MID} />
          {!isMobile && "Research"}
        </button>
        <Button kind="primary" onClick={handleSend} disabled={!canSend} aria-label="Send"
          style={{ width: 46, minHeight: 46, padding: 0, flexShrink: 0 }}>
          <IconSend size={16} color={ink.button.fg} />
        </Button>
      </div>
      {nearLimit && (
        <p style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: over ? DANGER : AMBER_TEXT, textAlign: "right", margin: "4px 0 0" }}>
          {value.length}/{MAX_INPUT}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "4px 12px", marginTop: 8, flexWrap: "wrap" }}>
        <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: TEXT_MUTED, margin: 0, lineHeight: 1.45 }}>
          Your advisor can make mistakes. Check important decisions yourself.
        </p>
        {(() => {
          const left = researchMode
            ? Math.max(0, LIMITS.research - researchUsed)
            : Math.max(0, LIMITS.chat - chatUsed);
          const label = researchMode
            ? (left === 0 ? "No research queries remaining" : `${left} research quer${left === 1 ? "y" : "ies"} remaining`)
            : (left === 0 ? "No messages remaining" : `${left} message${left === 1 ? "" : "s"} remaining`);
          return (
            <span style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, whiteSpace: "nowrap",
              color: left <= (researchMode ? 0 : 3) ? DANGER : TEXT_MUTED }}>
              {label}
            </span>
          );
        })()}
      </div>
    </div>
  );
}

// ─── WelcomeScreen ────────────────────────────────────────────────────────────

function WelcomeScreen({ onSend, userName, isMobile = false }) {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = userName?.split(" ")[0];
  const ink = useAgentInk();

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100%",
      padding: isMobile ? "28px 16px 24px" : "40px 32px 24px", boxSizing: "border-box" }}>
      <div style={{ width: "100%", maxWidth: 680, margin: "0 auto" }}>
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "2.1rem" : "2.5rem",
            color: ink.title, letterSpacing: "-0.03em", margin: "0 0 0.4rem", lineHeight: 1.1 }}>
            Good {timeOfDay}{firstName ? `, ${firstName}` : ""}.
          </h1>
          <Tip name="Your AI Mentor" stamp="chat" tone="default" style={{ marginBottom: 24 }}>
            <span style={{ fontSize: isMobile ? "1rem" : "1.05rem", lineHeight: 1.6 }}>
              What's on your mind? Ask about your applications, your quest, or anything you're working through.
            </span>
          </Tip>
        </motion.div>

        {/* Prompt starters */}
        <motion.div
          role="group"
          aria-label="Suggested questions"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingLeft: isMobile ? 0 : 54 }}
        >
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              type="button"
              className={FOCUS_CLASS}
              onClick={() => onSend(s.label)}
              style={{
                fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.3,
                background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: RADIUS.pill,
                minHeight: 44, padding: "8px 16px", textAlign: "left", cursor: "pointer", boxSizing: "border-box",
                maxWidth: "100%", transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = ink.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = BORDER; }}
            >
              {s.label}
            </button>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

// ─── RenameInput ──────────────────────────────────────────────────────────────

function RenameInput({ initial, onSave, onCancel }) {
  const [val, setVal] = useState(initial);
  const ink = useAgentInk();
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (val.trim()) onSave(val.trim()); }} style={{ display: "flex", gap: 4, width: "100%" }}>
      <input
        ref={inputRef} value={val}
        className={INPUT_CLASS}
        aria-label="Conversation name"
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        onBlur={onCancel}
        style={{ ...inputStyle, flex: 1, minWidth: 0, minHeight: 36, padding: "4px 8px", fontSize: "0.95rem", fontWeight: 600,
          borderRadius: 8, borderColor: ink.text }}
      />
      <button type="submit" aria-label="Save name" className={FOCUS_CLASS} onMouseDown={(e) => e.preventDefault()}
        style={{ width: 36, minHeight: 36, borderRadius: 8, border: `1px solid ${ink.soft}`, background: ink.softer, cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <IconCheck size={13} color={ink.onSoft} />
      </button>
    </form>
  );
}

// ─── HistoryPanel ─────────────────────────────────────────────────────────────

function HistoryPanel({ sessions, activeChatId, onSelectChat, onNewChat, onDeleteChat, onRenameChat, fullWidth = false }) {
  const ink = useAgentInk();
  const grouped = groupChatsByDate(sessions);
  const ORDER   = ["Today", "Yesterday", "This Week", "This Month", "Older"];
  const [renamingId, setRenamingId] = useState(null);

  const ChatItem = ({ session }) => {
    const isActive   = session.id === activeChatId;
    const [hovered, setHovered] = useState(false);
    const isRenaming = renamingId === session.id;
    const title = sessionTitle(session);
    const hasResearch = session.messages?.some((m) => m.type === "research");

    return (
      <div
        onClick={() => !isRenaming && onSelectChat(session.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative", padding: "8px 10px", borderRadius: 10,
          cursor: isRenaming ? "default" : "pointer",
          display: "flex", alignItems: "center", gap: 8,
          background: isActive ? ink.softer : hovered ? BG : "transparent",
          boxShadow: isActive ? `inset 3px 0 0 ${ink.text}` : "none",
          marginBottom: 2, transition: "background 0.12s",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {isRenaming ? (
            <RenameInput
              initial={title}
              onSave={(t) => { onRenameChat(session.id, t); setRenamingId(null); }}
              onCancel={() => setRenamingId(null)}
            />
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                {hasResearch && <span style={{ flexShrink: 0, display: "flex" }}><IconSearch size={12} color={ink.text} /></span>}
                <p style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: isActive ? 800 : 600, color: isActive ? TEXT : TEXT_MID, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4, margin: 0 }}>
                  {title}
                </p>
              </div>
              <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: TEXT_MUTED, margin: "1px 0 0" }}>
                {timeAgo(session.updated_at)}
              </p>
            </>
          )}
        </div>
        {hovered && !isRenaming && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            <button type="button" aria-label="Rename" className={FOCUS_CLASS} onClick={(e) => { e.stopPropagation(); setRenamingId(session.id); }}
              style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`, background: WHITE, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }} title="Rename">
              <IconEdit size={13} color={TEXT_MUTED} />
            </button>
            <button type="button" aria-label="Delete" className={FOCUS_CLASS} onClick={(e) => { e.stopPropagation(); onDeleteChat(session.id); }}
              style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #f4c7c2", background: "#fdf1f0", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }} title="Delete">
              <IconTrash size={13} color={DANGER} />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      width: fullWidth ? "100%" : HISTORY_W, height: "100%", flexShrink: 0,
      background: WHITE,
      borderLeft: fullWidth ? "none" : `1px solid ${BORDER}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
      flex: fullWidth ? 1 : undefined,
      fontFamily: SANS,
    }}>
      {/* Header */}
      <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1rem", color: TEXT, letterSpacing: "-0.01em" }}>
            Conversations
          </span>
          <span style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED }}>
            {sessions.length > 0 ? `${sessions.length}` : ""}
          </span>
        </div>
        <Button onClick={onNewChat} style={{ width: "100%", justifyContent: "flex-start", fontSize: "0.95rem", padding: "8px 12px" }}>
          <IconPlus size={14} color={TEXT_MID} /> New conversation
        </Button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
        {ORDER.map((group) =>
          grouped[group]?.length > 0 ? (
            <div key={group} style={{ marginBottom: 14 }}>
              <p style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, letterSpacing: "0.02em", color: TEXT_MUTED, padding: "3px 6px 5px", margin: "0 0 2px" }}>
                {group}
              </p>
              {grouped[group].map((s) => <ChatItem key={s.id} session={s} />)}
            </div>
          ) : null
        )}
        {sessions.length === 0 && (
          <p style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, textAlign: "center", marginTop: 32, padding: "0 12px", lineHeight: 1.6 }}>
            No conversations yet.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── ChatMain ─────────────────────────────────────────────────────────────────

function ChatMain({ activeChatId, messages, busy, onSend, userName, error, onOpenHistory, chatUsed = 0, researchUsed = 0, researchMode, onToggleResearch, isMobile = false }) {
  const bottomRef = useRef(null);
  const isNew = activeChatId === null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: BG, overflow: "hidden", position: "relative" }}>

      {/* Top bar */}
      <div style={{
        height: 60, flexShrink: 0, paddingLeft: isMobile ? 16 : 24, paddingRight: isMobile ? 12 : 16,
        background: WHITE,
        borderBottom: `1px solid ${BORDER}`,
        display: "flex", alignItems: "center", gap: 10, zIndex: 5,
      }}>
        <AgentAvatar size={32} />
        <h2 style={{ fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: TEXT, letterSpacing: "-0.01em", margin: 0 }}>
          Mentorable Chat
        </h2>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {onOpenHistory && (
            <Button
              onClick={onOpenHistory}
              aria-label="Chat history"
              title="Chat history"
              style={{ width: 44, padding: 0 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TEXT_MID} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 3v5h5"/>
                <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
                <path d="M12 7v5l4 2"/>
              </svg>
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: isNew ? (isMobile ? "0 0 150px" : "0 0 150px") : isMobile ? "16px 16px 150px" : "28px 28px 150px", position: "relative", zIndex: 1, display: isNew ? "flex" : "block", flexDirection: "column" }}>
        {isNew ? (
          <WelcomeScreen onSend={onSend} userName={userName} isMobile={isMobile} />
        ) : (
          <div style={{ maxWidth: 880, margin: "0 auto" }}>
            <AnimatePresence initial={false}>
              {messages.map((msg) => <Message key={msg.id} msg={msg} isMobile={isMobile} />)}
            </AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ display: "flex", gap: 11, marginBottom: 20, paddingRight: isMobile ? 0 : 80, alignItems: "flex-start" }}
              >
                {!isMobile && <AgentAvatar size={32} />}
                <Notice tone="error" style={{ maxWidth: 520, flex: "0 1 auto" }}>{error}</Notice>
              </motion.div>
            )}
            <div ref={bottomRef} style={{ height: 24 }} />
          </div>
        )}
      </div>

      {/* Bottom input area: floats over the message list with a fade above it
          so scrolled content softens into it instead of hitting a hard edge */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 10 }}>
        <div style={{ height: 40, background: "linear-gradient(to bottom, rgba(245,245,245,0), rgba(245,245,245,0.94) 70%, #F5F5F5)", pointerEvents: "none" }} />
        <div style={{ background: BG }}>
          <InputBar
            onSend={onSend}
            busy={busy}
            chatLimitReached={chatUsed >= LIMITS.chat}
            researchLimitReached={researchUsed >= LIMITS.research}
            researchMode={researchMode}
            onToggleResearch={onToggleResearch}
            isMobile={isMobile}
            chatUsed={chatUsed}
            researchUsed={researchUsed}
          />
        </div>
      </div>
    </div>
  );
}

// ─── ChatPage ─────────────────────────────────────────────────────────────────

// Persists just the display name across hard refreshes (the in-memory cache in
// lib/cache.js resets on reload) so the welcome greeting never has to show
// "Good morning." without a name while the profile re-fetches.
const NAME_STORAGE_KEY = "mentorable_display_name";
function getStoredName() {
  try { return localStorage.getItem(NAME_STORAGE_KEY) || ""; } catch { return ""; }
}
function storeName(name) {
  try { if (name) localStorage.setItem(NAME_STORAGE_KEY, name); } catch { /* ignore */ }
}

export default function ChatPage({ navigate, seedNode }) {
  const [user, setUser]               = useState(null);
  const [profile, setProfile]         = useState(() => getCache(`profile:${getKnownUserId()}`) || null);
  const [displayName, setDisplayName] = useState(() => getCache(`profile:${getKnownUserId()}`)?.full_name || getStoredName());
  const [recentResearch, setRecentResearch]   = useState(() => getCache(`recent_research:${getKnownUserId()}`) || []);
  const [sessions, setSessions]       = useState(() => getCache(`chat_sessions:${getKnownUserId()}`) || []);
  const [activeChatId, setActiveChatId] = useState(() => getActiveChat(getKnownUserId()));
  const [messages, setMessages]       = useState([]);
  const [streaming, setStreaming]     = useState(false);
  const [chatError, setChatError]     = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false); // desktop-only collapse
  const [chatUsed, setChatUsed]       = useState(0);
  const [researchUsed, setResearchUsed] = useState(0);
  const [researchMode, setResearchMode] = useState(false);
  const [researching, setResearching] = useState(false);
  const [limitModal, setLimitModal]   = useState(null);
  const [recordToast, setRecordToast] = useState(null);   // { verb, title, where }
  const recordToastTimer = useRef(null);
  const { refresh: refreshQuest } = useQuest();
  const isMobile = useIsMobile();
  const ink = useAgentInk();

  const skipHydrationRef = useRef(false);
  const seedConsumedRef = useRef(false);

  // "Chat about this node" deep-link: open a fresh conversation seeded with the
  // node, auto-sending the opening turn so it reads as the assistant speaking first.
  useEffect(() => {
    if (!user || !seedNode || seedConsumedRef.current) return;
    seedConsumedRef.current = true;
    handleNewChat();
    handleSend(`Let's talk through "${seedNode.title}".`, seedNode.id);
  }, [user, seedNode]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { navigate("/auth"); return; }
      const uid = data.user.id;
      setUser(data.user);
      setKnownUserId(uid);

      const [sessionsRes, profileRes, researchRes] = await Promise.all([
        supabase.from("chat_sessions").select("id, title, messages, created_at, updated_at, roadmap_node_id")
          .eq("user_id", uid).order("updated_at", { ascending: false }),
        supabase.from("profiles").select("*").eq("id", uid).single(),
        supabase.from("research_sessions")
          .select("query")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (sessionsRes.data)  { setSessions(sessionsRes.data); setCache(`chat_sessions:${uid}`, sessionsRes.data); }
      if (profileRes.data)   { setProfile(profileRes.data);   setCache(`profile:${uid}`, profileRes.data); if (profileRes.data.full_name) { setDisplayName(profileRes.data.full_name); storeName(profileRes.data.full_name); } }
      if (researchRes.data) {
        const queries = researchRes.data.map(r => r.query).filter(Boolean);
        setRecentResearch(queries);       setCache(`recent_research:${uid}`, queries);
      }

      // Load lifetime usage
      fetchUsage(supabase).then((u) => { setChatUsed(u.chat_messages_used); setResearchUsed(u.research_queries_used); });
    });
  }, []);

  useEffect(() => {
    if (!activeChatId) { setMessages([]); setChatError(null); return; }
    if (skipHydrationRef.current) return;
    const session = sessions.find((s) => s.id === activeChatId);
    setMessages(session?.messages || []);
    setChatError(null);
  }, [activeChatId, sessions]);

  // Remember which chat was open so returning to this page reopens it.
  useEffect(() => { if (user) setActiveChat(user.id, activeChatId); }, [user, activeChatId]);

  // Resume a reply that was still generating when the user navigated away. The
  // background stream keeps running and saves to chat_sessions on its own; here
  // we just show the in-progress state and poll until the assistant reply lands.
  const resumeCheckedRef = useRef(false);
  useEffect(() => {
    if (!user || resumeCheckedRef.current) return;
    if (!sessions.length || !activeChatId) return;
    resumeCheckedRef.current = true;
    if (!isChatGenerating(user.id, activeChatId)) return;

    const session = sessions.find((s) => s.id === activeChatId);
    const base = session?.messages || [];
    const last = base[base.length - 1];
    if (last && last.role !== "user") { clearChatGenerating(user.id, activeChatId); return; }

    skipHydrationRef.current = true;
    setStreaming(true);
    setMessages([...base, { id: "m_resume", role: "ai", content: "", streaming: true, time: "", created_at: new Date().toISOString() }]);

    const started = Date.now();
    const poll = setInterval(async () => {
      const { data } = await supabase.from("chat_sessions")
        .select("messages").eq("id", activeChatId).single();
      const msgs = data?.messages || [];
      const lastMsg = msgs[msgs.length - 1];
      if ((lastMsg && lastMsg.role !== "user") || Date.now() - started > 90_000) {
        clearInterval(poll);
        clearChatGenerating(user.id, activeChatId);
        skipHydrationRef.current = false;
        setStreaming(false);
        if (msgs.length) setMessages(msgs);  // drop the resume placeholder
        refreshSessions(user.id);
      }
    }, 1500);
    return () => clearInterval(poll);
  }, [user, sessions, activeChatId]);

  const refreshSessions = useCallback(async (userId) => {
    const { data } = await supabase.from("chat_sessions")
      .select("id, title, messages, created_at, updated_at, roadmap_node_id")
      .eq("user_id", userId).order("updated_at", { ascending: false });
    if (data) { setSessions(data); setCache(`chat_sessions:${userId}`, data); }
  }, []);

  const handleNewChat    = () => { setActiveChatId(null); setMessages([]); setChatError(null); };
  const handleSelectChat = (id) => { const s = sessions.find((s) => s.id === id); setActiveChatId(id); setMessages(s?.messages || []); setChatError(null); };
  const handleDeleteChat = async (id) => {
    await supabase.from("chat_sessions").delete().eq("id", id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeChatId === id) { setActiveChatId(null); setMessages([]); }
  };
  const handleRenameChat = async (id, newTitle) => {
    await supabase.from("chat_sessions").update({ title: newTitle }).eq("id", id);
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title: newTitle } : s));
  };

  const handleSend = useCallback(async (text, seedNodeId) => {
    if (!user || streaming) return;
    setChatError(null);

    const now = new Date().toISOString();
    const userMsg   = { id: `m_${Date.now()}`,     role: "user", content: text,  time: formatTime(now), created_at: now };
    const aiMsgId   = `m_${Date.now() + 1}`;
    const aiMsgBase = { id: aiMsgId, role: "ai", content: "", streaming: true, time: formatTime(now), created_at: now };

    let sessionId = activeChatId;
    let historyBeforeSend;
    // New session: use the seed node id (if this is a "chat about this node" open).
    // Existing session: keep using whichever node it was already scoped to.
    const nodeId = sessionId
      ? (sessions.find((s) => s.id === sessionId)?.roadmap_node_id ?? null)
      : (seedNodeId ?? null);

    if (!sessionId) {
      const { data: newSession, error } = await supabase.from("chat_sessions")
        .insert({ user_id: user.id, messages: [userMsg], updated_at: new Date().toISOString(), roadmap_node_id: nodeId })
        .select().single();
      if (error || !newSession) { setChatError("Failed to start a new chat. Please try again."); return; }
      sessionId = newSession.id;
      skipHydrationRef.current = true;
      setActiveChatId(sessionId);
      setSessions((prev) => [newSession, ...prev]);
      historyBeforeSend = [userMsg];
    } else {
      historyBeforeSend = [...messages, userMsg];
    }

      const withUser = [...historyBeforeSend.filter((m) => m.id !== aiMsgId)];
    setMessages([...withUser, aiMsgBase]);
    setStreaming(true);
    markChatGenerating(user.id, sessionId);  // survives navigation away mid-reply

    try {
      await streamChatResponse({
        history: withUser,
        nodeId,
        onChunk: (chunk) => {
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === aiMsgId);
            if (idx === -1) return prev;
            const updated = [...prev];
            updated[idx] = { ...updated[idx], content: updated[idx].content + chunk };
            return updated;
          });
        },
        onEvent: (evt) => {
          // The agent edits the same record the Portfolio page shows, so every
          // write it makes is confirmed here rather than only in its own prose.
          const where = evt.event === "portfolio_changed" ? "portfolio" : evt.event === "quest_changed" ? "quest" : null;
          if (where && evt.item?.title) {
            setRecordToast({ verb: evt.verb || "Updated", title: evt.item.title, where });
            if (recordToastTimer.current) clearTimeout(recordToastTimer.current);
            recordToastTimer.current = setTimeout(() => setRecordToast(null), 5000);
          }
          // A reshaped or retired quest changes the streak chip in the nav.
          if (where === "quest") refreshQuest();
        },
        onDone: async (fullText) => {
          const aiMsgFinal  = { ...aiMsgBase, content: fullText, streaming: false };
          const finalMessages = [...withUser, aiMsgFinal];
          setMessages(finalMessages);
          setStreaming(false);
          const { error: saveError } = await supabase.from("chat_sessions").update({
            messages: finalMessages, updated_at: new Date().toISOString(),
          }).eq("id", sessionId);
          if (saveError) console.error("[Chat] failed to save messages:", saveError.message);
          clearChatGenerating(user.id, sessionId);
          await refreshSessions(user.id);
          skipHydrationRef.current = false;
        },
      });
    } catch (err) {
      skipHydrationRef.current = false;
      clearChatGenerating(user.id, sessionId);
      setMessages((prev) => prev.filter((m) => m.id !== aiMsgId));
      setStreaming(false);
      if (err?.message?.includes('LIMIT_REACHED') || err?.message?.includes('429')) {
        setLimitModal("chat");
        setChatUsed(LIMITS.chat);
      } else {
        setChatError("The agent couldn't respond right now. Please try again.");
      }
      await supabase.from("chat_sessions").update({
        messages: withUser, updated_at: new Date().toISOString(),
      }).eq("id", sessionId);
    }
  }, [user, activeChatId, messages, sessions, streaming, refreshSessions]);

  const handleResearchSend = useCallback(async (text) => {
    if (!user || streaming || researching) return;
    setResearchMode(false); // single-shot: revert the toggle the moment it's used
    setChatError(null);

    const now = new Date().toISOString();
    const userMsg = { id: `m_${Date.now()}`, role: "user", content: text, time: formatTime(now), created_at: now };
    const researchMsgId = `m_${Date.now() + 1}`;
    const researchingMsg = { id: researchMsgId, role: "ai", type: "research", researching: true, time: formatTime(now), created_at: now };

    let sessionId = activeChatId;
    let historyBeforeSend;
    const nodeId = sessionId ? (sessions.find((s) => s.id === sessionId)?.roadmap_node_id ?? null) : null;

    if (!sessionId) {
      const { data: newSession, error } = await supabase.from("chat_sessions")
        .insert({ user_id: user.id, messages: [userMsg], updated_at: new Date().toISOString(), roadmap_node_id: nodeId })
        .select().single();
      if (error || !newSession) { setChatError("Failed to start a new chat. Please try again."); return; }
      sessionId = newSession.id;
      skipHydrationRef.current = true;
      setActiveChatId(sessionId);
      setSessions((prev) => [newSession, ...prev]);
      historyBeforeSend = [userMsg];
    } else {
      historyBeforeSend = [...messages, userMsg];
    }

    setMessages([...historyBeforeSend, researchingMsg]);
    setResearching(true);

    try {
      const { results, sources } = await runResearch(text);
      const finalMsg = {
        id: researchMsgId, role: "ai", type: "research",
        content: summarizeResearchForHistory(text, results),
        results, sources,
        time: formatTime(now), created_at: now,
      };
      const finalMessages = [...historyBeforeSend, finalMsg];
      setMessages(finalMessages);
      const { error: saveError } = await supabase.from("chat_sessions").update({
        messages: finalMessages, updated_at: new Date().toISOString(),
      }).eq("id", sessionId);
      if (saveError) console.error("[Research] failed to save messages:", saveError.message);
      setResearchUsed((n) => n + 1);
      await refreshSessions(user.id);
      skipHydrationRef.current = false;
    } catch (err) {
      skipHydrationRef.current = false;
      setMessages((prev) => prev.filter((m) => m.id !== researchMsgId));
      if (err instanceof ResearchLimitError) {
        setLimitModal("research");
        setResearchUsed(LIMITS.research);
        await supabase.from("chat_sessions").update({
          messages: historyBeforeSend, updated_at: new Date().toISOString(),
        }).eq("id", sessionId);
      } else {
        setChatError("Research couldn't complete right now. Please try again.");
        await supabase.from("chat_sessions").update({
          messages: historyBeforeSend, updated_at: new Date().toISOString(),
        }).eq("id", sessionId);
      }
    } finally {
      setResearching(false);
    }
  }, [user, activeChatId, messages, sessions, streaming, researching, refreshSessions]);

  const handleUnifiedSend = (text) => (researchMode ? handleResearchSend(text) : handleSend(text));

  const historyPanel = (
    <HistoryPanel
      sessions={sessions}
      activeChatId={activeChatId}
      onSelectChat={(id) => { handleSelectChat(id); setHistoryOpen(false); }}
      onNewChat={() => { handleNewChat(); setHistoryOpen(false); }}
      onDeleteChat={handleDeleteChat}
      onRenameChat={handleRenameChat}
      fullWidth={isMobile}
    />
  );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(20,20,19,0.18); border-radius: 99px; }
        ${STREAMING_CSS}
        @keyframes spinner-rotate { to { transform: rotate(360deg); } }
      `}</style>

      <Toast
        isMobile={isMobile}
        sidebar={SIDEBAR_WIDTH}
        onDismiss={() => setRecordToast(null)}
        notice={recordToast ? {
          text: (
            <span style={{ display: "inline-flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{ flexShrink: 0, marginTop: 4, display: "inline-flex" }}><IconCheck size={14} color={ink.text} /></span>
              <span>
                {recordToast.where === "quest"
                  ? <>{recordToast.verb} your quest <strong>{recordToast.title}</strong></>
                  : <>{recordToast.verb} <strong>{recordToast.title}</strong> in your Portfolio</>}
              </span>
            </span>
          ),
        } : null}
      />

      <div
        data-sidebar-offset
        className="ui-page"
        style={{
          ...ringVar(ink),
          fontFamily: SANS,
          background: BG,
          marginLeft: isMobile ? 0 : SIDEBAR_WIDTH,
          height: "100dvh",
          display: "flex",
          overflow: "hidden",
          // Keep the input bar clear of the fixed 60px MobileNav.
          paddingBottom: isMobile ? "calc(60px + env(safe-area-inset-bottom, 0px))" : 0,
        }}
      >
        <ChatMain
          activeChatId={activeChatId}
          messages={messages}
          busy={streaming || researching}
          onSend={handleUnifiedSend}
          userName={displayName || profile?.full_name || ""}
          error={chatError}
          onOpenHistory={isMobile ? () => setHistoryOpen(true) : () => setHistoryCollapsed((v) => !v)}
          chatUsed={chatUsed}
          researchUsed={researchUsed}
          researchMode={researchMode}
          onToggleResearch={() => setResearchMode((v) => !v)}
          isMobile={isMobile}
        />
        {!isMobile && (
          <motion.div
            initial={false}
            animate={{ width: historyCollapsed ? 0 : HISTORY_W }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden", flexShrink: 0, height: "100%" }}
          >
            {historyPanel}
          </motion.div>
        )}
      </div>

      {/* Mobile history drawer */}
      {isMobile && (
        <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} width={HISTORY_W + 16}>
          {historyPanel}
        </Drawer>
      )}

      {limitModal && <LimitModal feature={limitModal} onClose={() => setLimitModal(null)} />}
    </>
  );
}
