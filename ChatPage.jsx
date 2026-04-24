import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "./lib/supabase.js";
import { buildSystemPrompt, streamChatResponse } from "./lib/mentora.js";
import Sidebar, { SIDEBAR_WIDTH } from "./components/common/Sidebar.jsx";
import Spinner from "./components/common/Spinner.jsx";

const ACCENT = "#3b5bfc";
const SG = "'Space Grotesk', sans-serif";
const JK = "'Plus Jakarta Sans', sans-serif";
const HISTORY_W = 260;

const SUGGESTIONS = [
  { icon: "🗺️", text: "What should I tackle next on my roadmap?" },
  { icon: "💼", text: "What internships fit my current skill level?" },
  { icon: "📝", text: "Help me write a college personal statement" },
  { icon: "🎯", text: "What career paths match my strengths?" },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function groupChatsByDate(sessions) {
  const now = new Date();
  const result = { pinned: [], Today: [], Yesterday: [], "Last 7 days": [], "Last month": [], Older: [] };
  sessions.forEach((s) => {
    if (s.pinned) { result.pinned.push(s); return; }
    const diffDays = (now - new Date(s.updated_at)) / 86400000;
    if (diffDays < 1) result["Today"].push(s);
    else if (diffDays < 2) result["Yesterday"].push(s);
    else if (diffDays < 7) result["Last 7 days"].push(s);
    else if (diffDays < 30) result["Last month"].push(s);
    else result["Older"].push(s);
  });
  return result;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "Yesterday";
  return `${Math.floor(diff / 86400)}d ago`;
}

function sessionTitle(session) {
  if (session.title) return session.title;
  const firstUser = session.messages?.find((m) => m.role === "user");
  return firstUser?.content?.split("\n")[0]?.slice(0, 60) || "New chat";
}

// ─── icons ────────────────────────────────────────────────────────────────────

const IconSend = ({ size = 17, color = "#fff" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M22 2L11 13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconPlus = ({ size = 15, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
);
const IconPin = ({ size = 12, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
);
const IconTrash = ({ size = 12, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
);
const IconEdit = ({ size = 12, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
);
const IconCheck = ({ size = 12, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
);
const IconCopy = ({ size = 13, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
);
const IconThumbUp = ({ size = 13, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" /><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" /></svg>
);

// ─── MentoraAvatar ────────────────────────────────────────────────────────────

function MentoraAvatar({ size = 28 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}bb)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, boxShadow: `0 2px 8px ${ACCENT}44`,
    }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
        <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="white" opacity="0.9" />
        <path d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z" fill="white" opacity="0.7" />
      </svg>
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function Inline({ text, color = "#0f172a" }) {
  // Parse **bold**, *italic*, `code` inline
  const tokens = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ t: "text", v: text.slice(last, m.index) });
    if (m[0].startsWith("**"))   tokens.push({ t: "bold",   v: m[2] });
    else if (m[0].startsWith("`")) tokens.push({ t: "code",   v: m[4] });
    else                           tokens.push({ t: "italic", v: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ t: "text", v: text.slice(last) });

  return (
    <>
      {tokens.map((tok, i) => {
        if (tok.t === "bold")   return <strong key={i} style={{ fontWeight: 700, color }}>{tok.v}</strong>;
        if (tok.t === "italic") return <em key={i} style={{ fontStyle: "italic", color }}>{tok.v}</em>;
        if (tok.t === "code")   return <code key={i} style={{ fontFamily: "monospace", fontSize: 13, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 4, padding: "1px 5px", color: "#334155" }}>{tok.v}</code>;
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

    // Headings
    if (/^### /.test(line)) { blocks.push({ type: "h3", text: line.slice(4) }); i++; continue; }
    if (/^## /.test(line))  { blocks.push({ type: "h2", text: line.slice(3) }); i++; continue; }
    if (/^# /.test(line))   { blocks.push({ type: "h1", text: line.slice(2) }); i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) { blocks.push({ type: "hr" }); i++; continue; }

    // Bullet list — collect consecutive items
    if (/^[-*+] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*+] /.test(lines[i])) {
        items.push(lines[i].replace(/^[-*+] /, "")); i++;
      }
      blocks.push({ type: "ul", items }); continue;
    }

    // Numbered list — collect consecutive items
    if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\. /, "")); i++;
      }
      blocks.push({ type: "ol", items }); continue;
    }

    // Blank line
    if (line.trim() === "") { blocks.push({ type: "spacer" }); i++; continue; }

    // Paragraph
    blocks.push({ type: "p", text: line }); i++;
  }

  const lastBlockIdx = blocks.length - 1;
  const color = "#0f172a";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {blocks.map((block, bi) => {
        const isLast = bi === lastBlockIdx;
        const cursor = streaming && isLast ? (
          <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 0.75, repeat: Infinity }}
            style={{ display: "inline-block", width: 2, height: "0.9em", background: ACCENT, marginLeft: 2, borderRadius: 1, verticalAlign: "text-bottom" }} />
        ) : null;

        if (block.type === "spacer") return <div key={bi} style={{ height: 6 }} />;
        if (block.type === "hr")     return <hr key={bi} style={{ border: "none", borderTop: "1px solid #e2e8f0", margin: "8px 0" }} />;

        if (block.type === "h1") return (
          <p key={bi} style={{ fontFamily: JK, fontWeight: 800, fontSize: 17, color, lineHeight: 1.35, margin: "10px 0 4px" }}>
            <Inline text={block.text} color={color} />{cursor}
          </p>
        );
        if (block.type === "h2") return (
          <p key={bi} style={{ fontFamily: JK, fontWeight: 700, fontSize: 15, color, lineHeight: 1.4, margin: "8px 0 3px" }}>
            <Inline text={block.text} color={color} />{cursor}
          </p>
        );
        if (block.type === "h3") return (
          <p key={bi} style={{ fontFamily: SG, fontWeight: 700, fontSize: 13.5, color: "#334155", lineHeight: 1.4, margin: "6px 0 2px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            <Inline text={block.text} color="#334155" />{cursor}
          </p>
        );

        if (block.type === "ul") return (
          <ul key={bi} style={{ paddingLeft: 18, margin: "4px 0", display: "flex", flexDirection: "column", gap: 3 }}>
            {block.items.map((item, ii) => {
              const isLastItem = isLast && ii === block.items.length - 1;
              return (
                <li key={ii} style={{ fontFamily: SG, fontSize: 14, color, lineHeight: 1.65, listStyleType: "disc" }}>
                  <Inline text={item} color={color} />
                  {streaming && isLastItem && cursor}
                </li>
              );
            })}
          </ul>
        );

        if (block.type === "ol") return (
          <ol key={bi} style={{ paddingLeft: 18, margin: "4px 0", display: "flex", flexDirection: "column", gap: 3 }}>
            {block.items.map((item, ii) => {
              const isLastItem = isLast && ii === block.items.length - 1;
              return (
                <li key={ii} style={{ fontFamily: SG, fontSize: 14, color, lineHeight: 1.65 }}>
                  <Inline text={item} color={color} />
                  {streaming && isLastItem && cursor}
                </li>
              );
            })}
          </ol>
        );

        // Default paragraph
        return (
          <p key={bi} style={{ fontFamily: SG, fontSize: 14, color, lineHeight: 1.65, margin: 0 }}>
            <Inline text={block.text} color={color} />{cursor}
          </p>
        );
      })}
    </div>
  );
}

// ─── Message ──────────────────────────────────────────────────────────────────

function Message({ msg }) {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);
  const isUser = msg.role === "user";
  const isStreaming = Boolean(msg.streaming);

  const handleCopy = () => {
    navigator.clipboard?.writeText(msg.content).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18, paddingLeft: 48 }}
      >
        <div style={{
          background: ACCENT, borderRadius: "18px 18px 4px 18px",
          padding: "12px 16px", maxWidth: 520,
          boxShadow: `0 2px 12px ${ACCENT}33`,
        }}>
          <p style={{ fontFamily: SG, fontSize: 14, color: "#fff", lineHeight: 1.6, margin: 0 }}>{msg.content}</p>
          <p style={{ fontFamily: SG, fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 4, textAlign: "right" }}>{msg.time}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      style={{ display: "flex", gap: 10, marginBottom: 18, paddingRight: 48, alignItems: "flex-start" }}
    >
      <MentoraAvatar size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          background: "#fff", borderRadius: "4px 18px 18px 18px",
          padding: "14px 16px", border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)", maxWidth: 600,
        }}>
          {msg.content
            ? <MarkdownRenderer text={msg.content} streaming={isStreaming} />
            : (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Spinner size={15} color={ACCENT} />
                <span style={{ fontFamily: SG, fontSize: 13, color: "#94a3b8", fontWeight: 500 }}>Thinking…</span>
              </div>
            )
          }
          {!isStreaming && msg.content && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTop: "1px solid #f1f5f9" }}>
              <p style={{ fontFamily: SG, fontSize: 10, color: "#94a3b8" }}>{msg.time}</p>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <button onClick={handleCopy} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, border: "1px solid #f1f5f9", background: copied ? "#f0fdf4" : "#f8fafc", color: copied ? "#10b981" : "#94a3b8", fontFamily: SG, fontSize: 11, fontWeight: 600, cursor: "pointer", transition: "all 0.15s" }}>
                  <IconCopy size={11} color={copied ? "#10b981" : "#94a3b8"} />
                  {copied ? "Copied!" : "Copy"}
                </button>
                <button onClick={() => setLiked((l) => !l)} style={{ display: "flex", alignItems: "center", padding: "3px 7px", borderRadius: 6, border: `1px solid ${liked ? ACCENT + "40" : "#f1f5f9"}`, background: liked ? ACCENT + "10" : "#f8fafc", color: liked ? ACCENT : "#94a3b8", cursor: "pointer", transition: "all 0.15s" }}>
                  <IconThumbUp size={11} color={liked ? ACCENT : "#94a3b8"} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── InputBar ─────────────────────────────────────────────────────────────────

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
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const canSend = value.trim() && !disabled;

  return (
    <div style={{ padding: "12px 20px 16px", background: "transparent", flexShrink: 0 }}>
      <div style={{
        background: "#fff",
        border: `1.5px solid ${value ? ACCENT + "60" : "rgba(0,0,0,0.1)"}`,
        borderRadius: 16,
        boxShadow: value ? `0 0 0 3px ${ACCENT}12` : "0 2px 12px rgba(0,0,0,0.06)",
        transition: "border-color 0.2s, box-shadow 0.2s",
        padding: "12px 12px 12px 16px",
        display: "flex", alignItems: "flex-end", gap: 10,
      }}>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => { setValue(e.target.value); autoResize(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Ask Mentora anything about your career…"
          rows={1}
          style={{ flex: 1, border: "none", background: "transparent", resize: "none", fontFamily: SG, fontSize: 14, color: "#0f172a", lineHeight: 1.6, padding: 0, outline: "none", maxHeight: 160, minHeight: 24 }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          style={{
            width: 38, height: 38, borderRadius: 11, border: "none", flexShrink: 0,
            background: canSend ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT}cc)` : "#e2e8f0",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: canSend ? `0 2px 10px ${ACCENT}44` : "none",
            cursor: canSend ? "pointer" : "not-allowed",
            transition: "background 0.2s, box-shadow 0.2s, transform 0.15s",
          }}
          onMouseEnter={(e) => { if (canSend) e.currentTarget.style.transform = "scale(1.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          onMouseDown={(e) => { if (canSend) e.currentTarget.style.transform = "scale(0.96)"; }}
          onMouseUp={(e) => { if (canSend) e.currentTarget.style.transform = "scale(1)"; }}
        >
          <IconSend size={16} color={canSend ? "#fff" : "#94a3b8"} />
        </button>
      </div>
      <p style={{ fontFamily: SG, fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 8 }}>
        Mentora can make mistakes. Verify important info with your school counselor.
      </p>
    </div>
  );
}

// ─── WelcomeScreen ────────────────────────────────────────────────────────────

function WelcomeScreen({ onSend, userName }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const name = userName ? `, ${userName.split(" ")[0]}` : "";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px 20px" }}>
      <motion.div initial={{ scale: 0.88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }} style={{ marginBottom: 20 }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT}aa)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 8px 32px ${ACCENT}44` }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="white" />
            <path d="M19 15L19.75 17.25L22 18L19.75 18.75L19 21L18.25 18.75L16 18L18.25 17.25L19 15Z" fill="white" opacity="0.7" />
          </svg>
        </div>
      </motion.div>

      <motion.div initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4, delay: 0.06 }} style={{ textAlign: "center", marginBottom: 32 }}>
        <h2 style={{ fontFamily: JK, fontWeight: 800, fontSize: 26, color: "#0f172a", letterSpacing: "-0.03em", marginBottom: 6 }}>
          {greeting}{name} 👋
        </h2>
        <p style={{ fontFamily: SG, fontSize: 15, color: "#64748b", fontWeight: 500 }}>
          I'm <strong style={{ color: ACCENT }}>Mentora</strong>, your AI career guide. What's on your mind?
        </p>
      </motion.div>

      <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4, delay: 0.12 }}
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%", maxWidth: 560 }}>
        {SUGGESTIONS.map((s, i) => (
          <motion.button key={i} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.3, delay: 0.14 + i * 0.06 }}
            onClick={() => onSend(s.text)}
            whileHover={{ y: -2, boxShadow: `0 4px 16px ${ACCENT}18` }}
            whileTap={{ scale: 0.98 }}
            style={{ background: "#fff", border: `1.5px solid rgba(0,0,0,0.07)`, borderRadius: 14, padding: "14px 16px", textAlign: "left", cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
            <span style={{ fontSize: 18, display: "block", marginBottom: 6 }}>{s.icon}</span>
            <span style={{ fontFamily: SG, fontSize: 13, color: "#334155", fontWeight: 600, lineHeight: 1.4 }}>{s.text}</span>
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
        ref={inputRef}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
        onBlur={onCancel}
        style={{ flex: 1, fontFamily: SG, fontSize: 12, fontWeight: 600, color: "#0f172a", border: `1.5px solid ${ACCENT}60`, borderRadius: 6, padding: "2px 6px", outline: "none", background: "#fff" }}
      />
      <button type="submit" onMouseDown={(e) => e.preventDefault()} style={{ padding: "2px 6px", borderRadius: 6, border: "none", background: ACCENT + "15", cursor: "pointer" }}>
        <IconCheck size={11} color={ACCENT} />
      </button>
    </form>
  );
}

// ─── HistoryPanel ─────────────────────────────────────────────────────────────

function HistoryPanel({ sessions, activeChatId, onSelectChat, onNewChat, onDeleteChat, onRenameChat }) {
  const grouped = groupChatsByDate(sessions);
  const ORDER = ["Today", "Yesterday", "Last 7 days", "Last month", "Older"];
  const [renamingId, setRenamingId] = useState(null);

  const ChatItem = ({ session }) => {
    const isActive = session.id === activeChatId;
    const [hovered, setHovered] = useState(false);
    const isRenaming = renamingId === session.id;
    const title = sessionTitle(session);

    return (
      <div
        onClick={() => !isRenaming && onSelectChat(session.id)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: "relative", padding: "8px 10px", borderRadius: 10,
          cursor: isRenaming ? "default" : "pointer",
          display: "flex", alignItems: "center", gap: 8,
          background: isActive ? ACCENT + "12" : hovered ? "rgba(59,91,252,0.04)" : "transparent",
          border: `1px solid ${isActive ? ACCENT + "30" : "transparent"}`,
          marginBottom: 1, transition: "background 0.14s",
        }}
      >
        {isActive && !isRenaming && <div style={{ position: "absolute", left: 0, top: 6, bottom: 6, width: 3, borderRadius: "0 3px 3px 0", background: ACCENT }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isRenaming ? (
            <RenameInput
              initial={title}
              onSave={(newTitle) => { onRenameChat(session.id, newTitle); setRenamingId(null); }}
              onCancel={() => setRenamingId(null)}
            />
          ) : (
            <>
              <p style={{ fontFamily: SG, fontSize: 12.5, fontWeight: isActive ? 700 : 500, color: isActive ? ACCENT : "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.4 }}>
                {title}
              </p>
              <p style={{ fontFamily: SG, fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{timeAgo(session.updated_at)}</p>
            </>
          )}
        </div>
        {hovered && !isRenaming && (
          <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
            <button onClick={(e) => { e.stopPropagation(); setRenamingId(session.id); }} style={{ padding: "3px 5px", borderRadius: 6, border: "none", background: "#f1f5f9", cursor: "pointer" }} title="Rename">
              <IconEdit size={12} color="#64748b" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onDeleteChat(session.id); }} style={{ padding: "3px 5px", borderRadius: 6, border: "none", background: "#fff1f1", cursor: "pointer" }} title="Delete">
              <IconTrash size={12} color="#ef4444" />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ width: HISTORY_W, flexShrink: 0, background: "#fff", borderLeft: "1px solid rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 }}>
        <span style={{ fontFamily: SG, fontWeight: 700, fontSize: 13, color: "#0f172a", display: "block", marginBottom: 10 }}>Chat history</span>
        <button onClick={onNewChat}
          style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: `1.5px solid ${ACCENT}30`, background: ACCENT + "08", display: "flex", alignItems: "center", gap: 7, fontFamily: SG, fontWeight: 700, fontSize: 13, color: ACCENT, cursor: "pointer", transition: "background 0.15s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = ACCENT + "14")}
          onMouseLeave={(e) => (e.currentTarget.style.background = ACCENT + "08")}>
          <IconPlus size={15} color={ACCENT} /> New chat
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
        {grouped.pinned.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 4px 6px", marginBottom: 2 }}>
              <IconPin size={11} color="#94a3b8" />
              <span style={{ fontFamily: SG, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8" }}>Pinned</span>
            </div>
            {grouped.pinned.map((s) => <ChatItem key={s.id} session={s} />)}
          </div>
        )}
        {ORDER.map((group) =>
          grouped[group]?.length > 0 ? (
            <div key={group} style={{ marginBottom: 16 }}>
              <p style={{ fontFamily: SG, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94a3b8", padding: "4px 4px 6px", marginBottom: 2 }}>{group}</p>
              {grouped[group].map((s) => <ChatItem key={s.id} session={s} />)}
            </div>
          ) : null
        )}
        {sessions.length === 0 && (
          <p style={{ fontFamily: SG, fontSize: 12, color: "#94a3b8", textAlign: "center", marginTop: 24, padding: "0 8px" }}>
            No chats yet. Start a conversation with Mentora!
          </p>
        )}
      </div>
    </div>
  );
}

// ─── ChatMain ─────────────────────────────────────────────────────────────────

function ChatMain({ activeChatId, messages, disabled, onSend, userName, error }) {
  const bottomRef = useRef(null);
  const isNew = activeChatId === null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#f8faff", overflow: "hidden" }}>
      <div style={{ padding: "0 20px", height: 52, flexShrink: 0, background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid rgba(0,0,0,0.06)", display: "flex", alignItems: "center", gap: 10, zIndex: 5 }}>
        <MentoraAvatar size={26} />
        <div>
          <span style={{ fontFamily: JK, fontWeight: 700, fontSize: 14, color: "#0f172a" }}>Mentora</span>
          <span style={{ fontFamily: SG, fontSize: 11, color: "#10b981", fontWeight: 600, marginLeft: 8 }}>● Online</span>
        </div>
        {activeChatId && (
          <span style={{ marginLeft: "auto", fontFamily: SG, fontSize: 12, color: "#94a3b8" }}>
            {messages.length} message{messages.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: isNew ? 0 : "24px 28px 0" }}>
        {isNew ? (
          <WelcomeScreen onSend={onSend} userName={userName} />
        ) : (
          <>
            <AnimatePresence initial={false}>
              {messages.map((msg) => <Message key={msg.id} msg={msg} />)}
            </AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", gap: 10, marginBottom: 18, paddingRight: 48, alignItems: "flex-start" }}>
                <MentoraAvatar size={30} />
                <div style={{ background: "#fff1f2", borderRadius: "4px 18px 18px 18px", padding: "12px 16px", border: "1px solid rgba(239,68,68,0.15)", maxWidth: 500 }}>
                  <p style={{ fontFamily: SG, fontSize: 13, color: "#dc2626", margin: 0 }}>{error}</p>
                </div>
              </motion.div>
            )}
            <div ref={bottomRef} style={{ height: 1 }} />
          </>
        )}
      </div>

      <InputBar onSend={onSend} disabled={disabled} />
    </div>
  );
}

// ─── ChatPage ─────────────────────────────────────────────────────────────────

export default function ChatPage({ navigate }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [roadmap, setRoadmap] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [chatError, setChatError] = useState(null);

  // Cache the system prompt; rebuild whenever profile or roadmap updates
  const systemPromptRef = useRef("");
  useEffect(() => {
    systemPromptRef.current = buildSystemPrompt(profile, roadmap);
  }, [profile, roadmap]);

  // ── bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data?.user) { navigate("/auth"); return; }
      const uid = data.user.id;
      setUser(data.user);

      // Load in parallel: sessions + profile + active roadmap
      const [sessionsRes, profileRes, roadmapRes] = await Promise.all([
        supabase.from("chat_sessions").select("id, title, messages, created_at, updated_at")
          .eq("user_id", uid).order("updated_at", { ascending: false }),
        supabase.from("profiles").select("*").eq("id", uid).single(),
        supabase.from("career_roadmaps").select("id, career_title").eq("user_id", uid).eq("is_active", true).single(),
      ]);

      if (sessionsRes.data) setSessions(sessionsRes.data);
      if (profileRes.data) setProfile(profileRes.data);

      if (roadmapRes.data) {
        const { data: phases } = await supabase
          .from("roadmap_phases")
          .select("*, tasks:roadmap_tasks(id, title, status, week_number)")
          .eq("roadmap_id", roadmapRes.data.id)
          .order("phase_number", { ascending: true });
        setRoadmap({ ...roadmapRes.data, phases: phases || [] });
      }
    });
  }, []);

  // When active chat changes, hydrate messages from in-memory sessions list
  useEffect(() => {
    if (!activeChatId) { setMessages([]); setChatError(null); return; }
    const session = sessions.find((s) => s.id === activeChatId);
    setMessages(session?.messages || []);
    setChatError(null);
  }, [activeChatId]);

  // ── session management ───────────────────────────────────────────────────────

  const refreshSessions = useCallback(async (userId) => {
    const { data } = await supabase.from("chat_sessions")
      .select("id, title, messages, created_at, updated_at")
      .eq("user_id", userId).order("updated_at", { ascending: false });
    if (data) setSessions(data);
  }, []);

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setChatError(null);
  };

  const handleSelectChat = (id) => {
    const session = sessions.find((s) => s.id === id);
    setActiveChatId(id);
    setMessages(session?.messages || []);
    setChatError(null);
  };

  const handleDeleteChat = async (id) => {
    await supabase.from("chat_sessions").delete().eq("id", id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeChatId === id) { setActiveChatId(null); setMessages([]); }
  };

  const handleRenameChat = async (id, newTitle) => {
    await supabase.from("chat_sessions").update({ title: newTitle }).eq("id", id);
    setSessions((prev) => prev.map((s) => s.id === id ? { ...s, title: newTitle } : s));
  };

  // ── send + stream ────────────────────────────────────────────────────────────

  const handleSend = useCallback(async (text) => {
    if (!user || streaming) return;
    setChatError(null);

    const userMsg = { id: `m_${Date.now()}`, role: "user", content: text, time: formatTime(new Date().toISOString()) };
    const aiMsgId = `m_${Date.now() + 1}`;
    const aiMsgBase = { id: aiMsgId, role: "ai", content: "", streaming: true, time: formatTime(new Date().toISOString()) };

    // Determine or create session
    let sessionId = activeChatId;
    let historyBeforeSend;

    if (!sessionId) {
      const { data: newSession, error } = await supabase
        .from("chat_sessions")
        .insert({ user_id: user.id, messages: [userMsg], updated_at: new Date().toISOString() })
        .select()
        .single();
      if (error || !newSession) { setChatError("Failed to start a new chat. Please try again."); return; }
      sessionId = newSession.id;
      setActiveChatId(sessionId);
      setSessions((prev) => [newSession, ...prev]);
      historyBeforeSend = [userMsg];
    } else {
      historyBeforeSend = [...messages, userMsg];
    }

    // Show user message + empty streaming AI bubble
    const withUser = [...historyBeforeSend.filter((m) => m.id !== aiMsgId)];
    setMessages([...withUser, aiMsgBase]);
    setStreaming(true);

    try {
      await streamChatResponse({
        systemPrompt: systemPromptRef.current,
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
        onDone: async (fullText) => {
          const aiMsgFinal = { ...aiMsgBase, content: fullText, streaming: false };
          const finalMessages = [...withUser, aiMsgFinal];

          setMessages(finalMessages);
          setStreaming(false);

          // Persist to Supabase
          await supabase.from("chat_sessions").update({
            messages: finalMessages,
            updated_at: new Date().toISOString(),
          }).eq("id", sessionId);

          // Refresh sidebar
          await refreshSessions(user.id);
        },
      });
    } catch (err) {
      console.error("[Chat] stream error:", err);
      setMessages((prev) => prev.filter((m) => m.id !== aiMsgId));
      setChatError("Mentora couldn't respond right now. Please try again.");
      setStreaming(false);

      // Still save the user's message even if AI failed
      const partialMessages = withUser;
      await supabase.from("chat_sessions").update({
        messages: partialMessages,
        updated_at: new Date().toISOString(),
      }).eq("id", sessionId);
    }
  }, [user, activeChatId, messages, streaming, refreshSessions]);

  const userName = profile?.full_name || "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(59,91,252,0.15);border-radius:99px;}
      `}</style>

      <Sidebar activePath="/chat" navigate={navigate} onModeClick={null} roadmapMode="discovery" />

      <div style={{ marginLeft: SIDEBAR_WIDTH, height: "100vh", display: "flex", overflow: "hidden", background: "#f8faff" }}>
        <ChatMain
          activeChatId={activeChatId}
          messages={messages}
          disabled={streaming}
          onSend={handleSend}
          userName={userName}
          error={chatError}
        />

        <HistoryPanel
          sessions={sessions}
          activeChatId={activeChatId}
          onSelectChat={handleSelectChat}
          onNewChat={handleNewChat}
          onDeleteChat={handleDeleteChat}
          onRenameChat={handleRenameChat}
        />
      </div>
    </>
  );
}
