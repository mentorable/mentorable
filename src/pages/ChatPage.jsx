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

const ACCENT  = "#3b82f6";
const NAVY    = "#141413";
const SG      = "'Inter', -apple-system, sans-serif";
const JK      = "'Inter', -apple-system, sans-serif";
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
  const result = { Today: [], Yesterday: [], "This week": [], "This month": [], Older: [] };
  sessions.forEach((s) => {
    const diffDays = (now - new Date(s.updated_at)) / 86400000;
    if (diffDays < 1)       result["Today"].push(s);
    else if (diffDays < 2)  result["Yesterday"].push(s);
    else if (diffDays < 7)  result["This week"].push(s);
    else if (diffDays < 30) result["This month"].push(s);
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

// ─── Streaming visualization ──────────────────────────────────────────────────

const STREAMING_CSS = `
@keyframes streamPulse {
  0%, 100% { box-shadow: 0 1px 4px rgba(0,0,0,0.04), 0 0 0 1.5px rgba(59,130,246,0.15); }
  50%       { box-shadow: 0 2px 16px rgba(59,130,246,0.1),  0 0 0 1.5px rgba(59,130,246,0.4); }
}
@keyframes streamSweep {
  0%   { transform: translateX(-100%); opacity: 0.6; }
  60%  { transform: translateX(0%);    opacity: 1; }
  100% { transform: translateX(100%);  opacity: 0; }
}
.streaming-bubble {
  animation: streamPulse 2s ease-in-out infinite;
  position: relative; overflow: hidden;
}
.streaming-bubble::before {
  content: "";
  position: absolute; top: 0; left: 0; right: 0; height: 2px;
  background: linear-gradient(90deg, transparent, ${ACCENT}80, ${ACCENT}, transparent);
  animation: streamSweep 1.8s ease-in-out infinite;
  border-radius: 2px 2px 0 0;
}
`;

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "2px 0" }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          animate={{ y: [0, -4, 0], opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.16, ease: "easeInOut" }}
          style={{ width: 6, height: 6, borderRadius: "50%", background: "#8e8b82", flexShrink: 0 }}
        />
      ))}
    </div>
  );
}

// ─── Agent avatar ─────────────────────────────────────────────────────────────

function AgentAvatar({ size = 28 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}cc)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
      boxShadow: `0 2px 8px ${ACCENT}44`,
    }}>
      <span style={{
        fontFamily: JK, fontWeight: 800,
        fontSize: size * 0.42, color: "#fff",
        letterSpacing: "-0.04em", lineHeight: 1,
        userSelect: "none",
      }}>m</span>
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function Inline({ text, color = NAVY }) {
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
        if (tok.t === "code")   return <code key={i} style={{ fontFamily: "monospace", fontSize: 12.5, background: "#f5f0e8", border: "1px solid #e2e8f0", borderRadius: 4, padding: "1px 5px", color: "#334155" }}>{tok.v}</code>;
        return <span key={i}>{tok.v}</span>;
      })}
    </>
  );
}

function MarkdownRenderer({ text, streaming = false }) {
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
    if (line.trim() === "") { blocks.push({ type: "spacer" }); i++; continue; }
    blocks.push({ type: "p", text: line }); i++;
  }

  const lastBlockIdx = blocks.length - 1;
  const cursor = streaming ? (
    <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.7, repeat: Infinity }}
      style={{ display: "inline-block", width: 2, height: "0.9em", background: ACCENT, marginLeft: 2, borderRadius: 1, verticalAlign: "text-bottom" }} />
  ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {blocks.map((block, bi) => {
        const isLast = bi === lastBlockIdx;
        const cur = isLast ? cursor : null;

        if (block.type === "spacer") return <div key={bi} style={{ height: 6 }} />;
        if (block.type === "hr")     return <hr key={bi} style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "8px 0" }} />;
        if (block.type === "h1")     return <p key={bi} style={{ fontFamily: JK, fontWeight: 800, fontSize: 17, color: NAVY, lineHeight: 1.35, margin: "10px 0 4px" }}><Inline text={block.text}/>{cur}</p>;
        if (block.type === "h2")     return <p key={bi} style={{ fontFamily: JK, fontWeight: 700, fontSize: 15, color: NAVY, lineHeight: 1.4,  margin: "8px 0 3px"  }}><Inline text={block.text}/>{cur}</p>;
        if (block.type === "h3")     return <p key={bi} style={{ fontFamily: SG, fontWeight: 700, fontSize: 12.5, color: "#3d3d3a", lineHeight: 1.4, margin: "6px 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}><Inline text={block.text} color="#3d3d3a"/>{cur}</p>;
        if (block.type === "ul")     return (
          <ul key={bi} style={{ paddingLeft: 18, margin: "4px 0", display: "flex", flexDirection: "column", gap: 3 }}>
            {block.items.map((item, ii) => (
              <li key={ii} style={{ fontFamily: SG, fontSize: 14, color: NAVY, lineHeight: 1.65, listStyleType: "disc" }}>
                <Inline text={item}/>{isLast && ii === block.items.length - 1 ? cursor : null}
              </li>
            ))}
          </ul>
        );
        if (block.type === "ol") return (
          <ol key={bi} style={{ paddingLeft: 18, margin: "4px 0", display: "flex", flexDirection: "column", gap: 3 }}>
            {block.items.map((item, ii) => (
              <li key={ii} style={{ fontFamily: SG, fontSize: 14, color: NAVY, lineHeight: 1.65 }}>
                <Inline text={item}/>{isLast && ii === block.items.length - 1 ? cursor : null}
              </li>
            ))}
          </ol>
        );
        return <p key={bi} style={{ fontFamily: SG, fontSize: 14, color: NAVY, lineHeight: 1.7, margin: 0 }}><Inline text={block.text}/>{cur}</p>;
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

function Message({ msg }) {
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
        style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20, paddingLeft: 80 }}
      >
        <div style={{
          background: ACCENT,
          borderRadius: "16px 16px 3px 16px",
          padding: "13px 18px",
          maxWidth: 520,
          boxShadow: `0 2px 10px ${ACCENT}33`,
        }}>
          <p style={{ fontFamily: SG, fontSize: 15.5, color: "#fff", lineHeight: 1.65, margin: 0 }}>{msg.content}</p>
          <p style={{ fontFamily: SG, fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 5, textAlign: "right" }}>{msg.time}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: "flex", gap: 11, marginBottom: 20, paddingRight: 80, alignItems: "flex-start" }}
    >
      <AgentAvatar size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          className={isStreaming ? "streaming-bubble" : undefined}
          style={{
            background: "#faf9f5",
            borderRadius: "3px 16px 16px 16px",
            padding: "16px 18px",
            border: isStreaming
              ? `1px solid ${ACCENT}40`
              : "1px solid rgba(29,78,216,0.1)",
            boxShadow: isStreaming
              ? `0 0 0 1px rgba(59,130,246,0.08), 0 4px 20px rgba(59,130,246,0.1)`
              : "0 2px 12px rgba(29,78,216,0.06), 0 1px 4px rgba(15,23,42,0.04)",
            maxWidth: 600,
          }}
        >
          {displayedText
            ? <MarkdownRenderer text={displayedText} streaming={isStreaming} />
            : <TypingIndicator />
          }
          {!isStreaming && msg.content && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
              <p style={{ fontFamily: SG, fontSize: 10, color: "#b0bac6" }}>{msg.time}</p>
              <button
                onClick={handleCopy}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 5, border: "1px solid #f1f5f9", background: copied ? "#f0fdf4" : "transparent", color: copied ? "#10b981" : "#b0bac6", fontFamily: SG, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}
              >
                <IconCopy size={11} color={copied ? "#10b981" : "#b0bac6"} />
                {copied ? "Copied" : "Copy"}
              </button>
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

function InputBar({ onSend, disabled }) {
  const [value, setValue] = useState("");
  const taRef = useRef(null);

  const autoResize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  };

  const handleSend = () => {
    const sanitized = sanitizeChatInput(value);
    if (!sanitized || disabled) return;
    onSend(sanitized);
    setValue("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const canSend = value.trim() && !disabled && value.length <= MAX_INPUT;
  const nearLimit = value.length > MAX_INPUT * 0.85;

  return (
    <div style={{ padding: "16px 28px 24px", flexShrink: 0 }}>
      <div style={{
        background: "#fff",
        border: `1.5px solid ${value.length > MAX_INPUT ? "#ef4444" : value ? ACCENT + "60" : "rgba(29,78,216,0.12)"}`,
        borderRadius: 16,
        boxShadow: value
          ? `0 0 0 3px ${ACCENT}14, 0 4px 20px rgba(59,130,246,0.1)`
          : "0 2px 12px rgba(29,78,216,0.06)",
        transition: "border-color 0.18s, box-shadow 0.18s",
        padding: "14px 14px 14px 20px",
        display: "flex", alignItems: "flex-end", gap: 10,
      }}>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => { if (e.target.value.length <= MAX_INPUT + 50) setValue(e.target.value); autoResize(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Ask anything about your career…"
          rows={1}
          style={{ flex: 1, border: "none", background: "transparent", resize: "none", fontFamily: SG, fontSize: 16, color: NAVY, lineHeight: 1.6, padding: 0, outline: "none", maxHeight: 160, minHeight: 26 }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            width: 40, height: 40, borderRadius: 12, border: "none", flexShrink: 0,
            background: canSend ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT}cc)` : "#e6dfd8",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: canSend ? "pointer" : "not-allowed",
            transition: "background 0.18s, transform 0.12s",
          }}
          onMouseEnter={(e) => { if (canSend) e.currentTarget.style.transform = "scale(1.05)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          onMouseDown={(e)  => { if (canSend) e.currentTarget.style.transform = "scale(0.95)"; }}
          onMouseUp={(e)    => { if (canSend) e.currentTarget.style.transform = "scale(1)"; }}
        >
          <IconSend size={15} color={canSend ? "#fff" : "#8e8b82"} />
        </button>
      </div>
      {nearLimit && (
        <p style={{ fontFamily: SG, fontSize: 11, color: value.length > MAX_INPUT ? "#ef4444" : "#f59e0b", textAlign: "right", marginTop: 4 }}>
          {value.length}/{MAX_INPUT}
        </p>
      )}
      <p style={{ fontFamily: SG, fontSize: 11, color: "#b0bac6", textAlign: "center", marginTop: 8 }}>
        Mentorable Agent can make mistakes. Verify important decisions with a counselor.
      </p>
    </div>
  );
}

// ─── WelcomeScreen ────────────────────────────────────────────────────────────

function WelcomeScreen({ onSend, userName }) {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = userName?.split(" ")[0];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 32px 24px", background: "radial-gradient(ellipse at 50% 30%, rgba(59,130,246,0.08) 0%, transparent 65%)" }}>

      {/* Wordmark */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        style={{ marginBottom: 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontFamily: JK, fontWeight: 800, fontSize: 22, color: NAVY, letterSpacing: "-0.04em" }}>
            mentorable
          </span>
          <motion.span
            animate={{ boxShadow: [`0 0 6px ${ACCENT}80`, `0 0 12px ${ACCENT}`, `0 0 6px ${ACCENT}80`] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT, display: "inline-block", marginBottom: 2 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 1, background: "#e6dfd8" }} />
          <span style={{ fontFamily: SG, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8e8b82" }}>your ai mentor</span>
          <div style={{ width: 28, height: 1, background: "#e6dfd8" }} />
        </div>
      </motion.div>

      {/* Greeting */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        style={{ textAlign: "center", marginBottom: 32 }}
      >
        <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 600, fontSize: 34, color: NAVY, letterSpacing: "-0.02em", marginBottom: 10, lineHeight: 1.15 }}>
          Good {timeOfDay}{firstName ? `, ${firstName}` : ""}.
        </h2>
        <p style={{ fontFamily: SG, fontSize: 16, color: "#6c6a64", fontWeight: 500, maxWidth: 380, lineHeight: 1.65 }}>
          What's on your mind? Ask about your Quest, career options, or anything you're working through.
        </p>
      </motion.div>

      {/* Prompt starters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", maxWidth: 500 }}
      >
        {SUGGESTIONS.map((s, i) => (
          <motion.button
            key={i}
            onClick={() => onSend(s.label)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.18 + i * 0.06 }}
            whileHover={{ y: -2, boxShadow: `0 4px 20px ${ACCENT}14` }}
            whileTap={{ scale: 0.97 }}
            style={{
              background: "#fff", border: "1.5px solid #e8edf2",
              borderRadius: 14, padding: "16px 18px",
              textAlign: "left", cursor: "pointer",
              boxShadow: "0 1px 4px rgba(15,23,42,0.05)",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${ACCENT}55`; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e6dfd8"; }}
          >
            <span style={{ fontFamily: SG, fontSize: 14.5, color: "#334155", fontWeight: 600, lineHeight: 1.5 }}>
              {s.label}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}

// ─── RenameInput ──────────────────────────────────────────────────────────────

function RenameInput({ initial, onSave, onCancel }) {
  const [val, setVal] = useState(initial);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (val.trim()) onSave(val.trim()); }} style={{ display: "flex", gap: 4, width: "100%" }}>
      <input
        ref={inputRef} value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        onBlur={onCancel}
        style={{ flex: 1, fontFamily: SG, fontSize: 12, fontWeight: 600, color: NAVY, border: `1.5px solid ${ACCENT}50`, borderRadius: 5, padding: "2px 7px", outline: "none", background: "#fff" }}
      />
      <button type="submit" onMouseDown={(e) => e.preventDefault()} style={{ padding: "2px 6px", borderRadius: 5, border: "none", background: `${ACCENT}15`, cursor: "pointer" }}>
        <IconCheck size={11} color={ACCENT} />
      </button>
    </form>
  );
}

// ─── HistoryPanel ─────────────────────────────────────────────────────────────

function HistoryPanel({ sessions, activeChatId, onSelectChat, onNewChat, onDeleteChat, onRenameChat, fullWidth = false }) {
  const grouped = groupChatsByDate(sessions);
  const ORDER   = ["Today", "Yesterday", "This week", "This month", "Older"];
  const [renamingId, setRenamingId] = useState(null);

  const ChatItem = ({ session }) => {
    const isActive   = session.id === activeChatId;
    const [hovered, setHovered] = useState(false);
    const isRenaming = renamingId === session.id;
    const title = sessionTitle(session);

    return (
      <div
        onClick={() => !isRenaming && onSelectChat(session.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative", padding: "7px 10px", borderRadius: 8,
          cursor: isRenaming ? "default" : "pointer",
          display: "flex", alignItems: "center", gap: 8,
          background: isActive ? "#f5f0e8" : hovered ? "#faf9f5" : "transparent",
          borderLeft: isActive ? `2px solid ${ACCENT}` : "2px solid transparent",
          marginBottom: 1, transition: "background 0.12s",
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
              <p style={{ fontFamily: SG, fontSize: 12.5, fontWeight: isActive ? 700 : 500, color: isActive ? NAVY : "#3d3d3a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4 }}>
                {title}
              </p>
              <p style={{ fontFamily: SG, fontSize: 10.5, color: "#8e8b82", marginTop: 1 }}>
                {timeAgo(session.updated_at)}
              </p>
            </>
          )}
        </div>
        {hovered && !isRenaming && (
          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
            <button onClick={(e) => { e.stopPropagation(); setRenamingId(session.id); }}
              style={{ padding: "3px 5px", borderRadius: 5, border: "none", background: "#f5f0e8", cursor: "pointer" }} title="Rename">
              <IconEdit size={12} color="#6c6a64" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDeleteChat(session.id); }}
              style={{ padding: "3px 5px", borderRadius: 5, border: "none", background: "#fef2f2", cursor: "pointer" }} title="Delete">
              <IconTrash size={12} color="#ef4444" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{
      width: fullWidth ? "100%" : HISTORY_W, flexShrink: 0,
      background: "#f5f0e8",
      borderLeft: fullWidth ? "none" : "1.5px solid #e2e8f0",
      display: "flex", flexDirection: "column", overflow: "hidden",
      flex: fullWidth ? 1 : undefined,
    }}>
      {/* Header */}
      <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid #e8edf2", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontFamily: JK, fontWeight: 700, fontSize: 12.5, color: NAVY, letterSpacing: "-0.01em" }}>
            Conversations
          </span>
          <span style={{ fontFamily: SG, fontSize: 10.5, color: "#8e8b82" }}>
            {sessions.length > 0 ? `${sessions.length}` : ""}
          </span>
        </div>
        <button
          onClick={onNewChat}
          style={{
            width: "100%", padding: "8px 12px", borderRadius: 8,
            border: `1.5px solid #e2e8f0`, background: "#fff",
            display: "flex", alignItems: "center", gap: 6,
            fontFamily: SG, fontWeight: 600, fontSize: 12.5, color: "#3d3d3a",
            cursor: "pointer", transition: "border-color 0.15s, background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${ACCENT}50`; e.currentTarget.style.background = "#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e6dfd8"; }}
        >
          <IconPlus size={13} color="#3d3d3a" /> New conversation
        </button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
        {ORDER.map((group) =>
          grouped[group]?.length > 0 ? (
            <div key={group} style={{ marginBottom: 14 }}>
              <p style={{ fontFamily: SG, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#b0bac6", padding: "3px 4px 5px", marginBottom: 2 }}>
                {group}
              </p>
              {grouped[group].map((s) => <ChatItem key={s.id} session={s} />)}
            </div>
          ) : null
        )}
        {sessions.length === 0 && (
          <p style={{ fontFamily: SG, fontSize: 12, color: "#b0bac6", textAlign: "center", marginTop: 32, padding: "0 12px", lineHeight: 1.6 }}>
            No conversations yet.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── ChatMain ─────────────────────────────────────────────────────────────────

function ChatMain({ activeChatId, messages, disabled, onSend, userName, error, onOpenHistory, chatUsed = 0 }) {
  const bottomRef = useRef(null);
  const isNew = activeChatId === null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#faf9f5", overflow: "hidden", backgroundImage: "radial-gradient(circle, rgba(59,130,246,0.05) 1px, transparent 1px)", backgroundSize: "32px 32px", position: "relative" }}>


      {/* Top bar */}
      <div style={{
        height: 54, flexShrink: 0, paddingLeft: 24, paddingRight: 16,
        background: "rgba(248,250,255,0.92)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(29,78,216,0.1)",
        boxShadow: "0 1px 0 0 rgba(29,78,216,0.05), 0 4px 24px rgba(29,78,216,0.03)",
        display: "flex", alignItems: "center", gap: 10, zIndex: 5,
      }}>
        <AgentAvatar size={28} />
        <div>
          <span style={{ fontFamily: JK, fontWeight: 800, fontSize: 14, color: NAVY, letterSpacing: "-0.03em" }}>
            Mentora
          </span>
          <span style={{ fontFamily: SG, fontSize: 11, color: "#8e8b82", fontWeight: 500, marginLeft: 6 }}>
            · AI Career Mentor
          </span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: 20, padding: "3px 9px" }}>
            <motion.span
              animate={{ boxShadow: ["0 0 0 0 rgba(16,185,129,0.4)", "0 0 0 4px rgba(16,185,129,0)", "0 0 0 0 rgba(16,185,129,0)"] }}
              transition={{ duration: 2.5, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }}
            />
            <span style={{ fontFamily: SG, fontSize: 11, fontWeight: 700, color: "#059669" }}>Online</span>
          </div>
          {onOpenHistory && (
            <button
              onClick={onOpenHistory}
              style={{
                marginLeft: 4, width: 34, height: 34, borderRadius: 8,
                border: "1.5px solid #e2e8f0", background: "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
              title="Chat history"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6c6a64" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="15" y2="18"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: isNew ? 0 : "28px 28px 8px", position: "relative", zIndex: 1 }}>
        {isNew ? (
          <WelcomeScreen onSend={onSend} userName={userName} />
        ) : (
          <>
            <AnimatePresence initial={false}>
              {messages.map((msg) => <Message key={msg.id} msg={msg} />)}
            </AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ display: "flex", gap: 11, marginBottom: 20, paddingRight: 80, alignItems: "flex-start" }}
              >
                <AgentAvatar size={30} />
                <div style={{ background: "#fef2f2", borderRadius: "3px 16px 16px 16px", padding: "12px 16px", border: "1px solid #fecaca", maxWidth: 500 }}>
                  <p style={{ fontFamily: SG, fontSize: 13, color: "#dc2626", margin: 0, lineHeight: 1.55 }}>{error}</p>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} style={{ height: 24 }} />
          </>
        )}
      </div>

      {/* Usage counter */}
      {(() => {
        const left = Math.max(0, LIMITS.chat - chatUsed);
        return (
          <div style={{ padding: "4px 16px 6px", textAlign: "center" }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 11, fontWeight: 600,
              color: left <= 3 ? "#dc2626" : "#9ca3af" }}>
              {left === 0 ? "No messages remaining" : `${left} message${left === 1 ? "" : "s"} remaining`}
            </span>
          </div>
        );
      })()}
      <InputBar onSend={onSend} disabled={disabled} />
    </div>
  );
}

// ─── ChatPage ─────────────────────────────────────────────────────────────────

export default function ChatPage({ navigate }) {
  const [user, setUser]               = useState(null);
  const [profile, setProfile]         = useState(() => getCache(`profile:${getKnownUserId()}`) || null);
  const [completedQuests, setCompletedQuests] = useState(() => getCache(`completed_quests:${getKnownUserId()}`) || []);
  const [activeQuests, setActiveQuests]       = useState(() => getCache(`active_quests:${getKnownUserId()}`) || []);
  const [deletedQuestTitles, setDeletedQuestTitles] = useState(() => getCache(`deleted_quest_titles:${getKnownUserId()}`) || []);
  const [recentResearch, setRecentResearch]   = useState(() => getCache(`recent_research:${getKnownUserId()}`) || []);
  const [sessions, setSessions]       = useState(() => getCache(`chat_sessions:${getKnownUserId()}`) || []);
  const [activeChatId, setActiveChatId] = useState(() => getActiveChat(getKnownUserId()));
  const [messages, setMessages]       = useState([]);
  const [streaming, setStreaming]     = useState(false);
  const [chatError, setChatError]     = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chatUsed, setChatUsed]       = useState(0);
  const [limitModal, setLimitModal]   = useState(false);
  const [questToast, setQuestToast]   = useState(null);
  const questToastTimer = useRef(null);
  const isMobile = useIsMobile();

  const skipHydrationRef = useRef(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { navigate("/auth"); return; }
      const uid = data.user.id;
      setUser(data.user);
      setKnownUserId(uid);

      const [sessionsRes, profileRes, allQuestsRes, researchRes] = await Promise.all([
        supabase.from("chat_sessions").select("id, title, messages, created_at, updated_at")
          .eq("user_id", uid).order("updated_at", { ascending: false }),
        supabase.from("profiles").select("*").eq("id", uid).single(),
        supabase.from("quest_items")
          .select("title, category, status, completed_at")
          .eq("user_id", uid)
          .in("status", ["completed", "in_progress", "considered", "deleted"])
          .order("completed_at", { ascending: false }),
        supabase.from("research_sessions")
          .select("query")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (sessionsRes.data)  { setSessions(sessionsRes.data); setCache(`chat_sessions:${uid}`, sessionsRes.data); }
      if (profileRes.data)   { setProfile(profileRes.data);   setCache(`profile:${uid}`, profileRes.data); }
      if (allQuestsRes.data) {
        const completed = allQuestsRes.data.filter(q => q.status === "completed");
        const active    = allQuestsRes.data.filter(q => ["in_progress", "considered"].includes(q.status));
        const deleted   = allQuestsRes.data.filter(q => q.status === "deleted").map(q => q.title);
        setCompletedQuests(completed);    setCache(`completed_quests:${uid}`, completed);
        setActiveQuests(active);          setCache(`active_quests:${uid}`, active);
        setDeletedQuestTitles(deleted);   setCache(`deleted_quest_titles:${uid}`, deleted);
      }
      if (researchRes.data) {
        const queries = researchRes.data.map(r => r.query).filter(Boolean);
        setRecentResearch(queries);       setCache(`recent_research:${uid}`, queries);
      }

      // Load lifetime usage
      fetchUsage(supabase).then((u) => setChatUsed(u.chat_messages_used));
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
      .select("id, title, messages, created_at, updated_at")
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

  const handleSend = useCallback(async (text) => {
    if (!user || streaming) return;
    setChatError(null);

    const now = new Date().toISOString();
    const userMsg   = { id: `m_${Date.now()}`,     role: "user", content: text,  time: formatTime(now), created_at: now };
    const aiMsgId   = `m_${Date.now() + 1}`;
    const aiMsgBase = { id: aiMsgId, role: "ai", content: "", streaming: true, time: formatTime(now), created_at: now };

    let sessionId = activeChatId;
    let historyBeforeSend;

    if (!sessionId) {
      const { data: newSession, error } = await supabase.from("chat_sessions")
        .insert({ user_id: user.id, messages: [userMsg], updated_at: new Date().toISOString() })
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
          if (evt.event === "quest_added" && evt.quest?.title) {
            setQuestToast({ title: evt.quest.title, column: evt.quest.column });
            if (questToastTimer.current) clearTimeout(questToastTimer.current);
            questToastTimer.current = setTimeout(() => setQuestToast(null), 5000);
          }
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
        setLimitModal(true);
        setChatUsed(LIMITS.chat);
      } else {
        setChatError("The agent couldn't respond right now. Please try again.");
      }
      await supabase.from("chat_sessions").update({
        messages: withUser, updated_at: new Date().toISOString(),
      }).eq("id", sessionId);
    }
  }, [user, activeChatId, messages, streaming, refreshSessions]);

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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @import
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(29,78,216,0.15); border-radius: 99px; }
        ${STREAMING_CSS}
        @keyframes questToastIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {questToast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: 10,
            maxWidth: 340,
            padding: "12px 16px",
            background: "#1d4ed8",
            color: "#fff",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(29,78,216,0.32)",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 14,
            animation: "questToastIn 0.25s ease",
          }}
        >
          <span style={{ fontSize: 16 }}>✓</span>
          <span>
            Added <strong>{questToast.title}</strong>
            {questToast.column ? ` to ${questToast.column}` : ""}
          </span>
        </div>
      )}

      <div
        data-sidebar-offset
        style={{
          marginLeft: isMobile ? 0 : SIDEBAR_WIDTH,
          height: "100dvh",
          display: "flex",
          overflow: "hidden",
        }}
      >
        <ChatMain
          activeChatId={activeChatId}
          messages={messages}
          disabled={streaming || chatUsed >= LIMITS.chat}
          onSend={handleSend}
          userName={profile?.full_name || ""}
          error={chatError}
          onOpenHistory={isMobile ? () => setHistoryOpen(true) : null}
          chatUsed={chatUsed}
        />
        {!isMobile && historyPanel}
      </div>

      {/* Mobile history drawer */}
      {isMobile && (
        <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} width={HISTORY_W + 16}>
          {historyPanel}
        </Drawer>
      )}

      {limitModal && <LimitModal feature="chat" onClose={() => setLimitModal(false)} />}
    </>
  );
}
