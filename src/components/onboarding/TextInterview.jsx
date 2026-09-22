import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabase.js";
import RecordPanel, { sectionsFromRecord } from "./RecordPanel.jsx";
import {
  SANS, TEXT, TEXT2, TEXT3, ACCENT, ACCENT2, BORDER,
  eyebrowStyle, titleStyle,
} from "./intakeTheme.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

// The interviewer is prompted to wrap by ~9 exchanges; this is the hard stop.
const MAX_EXCHANGES = 12;

function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.5rem" }}>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.1rem", color: TEXT, letterSpacing: "-0.04em" }}>
        mentorable
      </span>
      <motion.span
        animate={{ scale: [1, 1.35, 1], opacity: [1, 0.7, 1] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          width: 7, height: 7, borderRadius: "50%",
          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`,
          display: "inline-block", flexShrink: 0,
          boxShadow: `0 0 10px ${ACCENT}60`,
        }}
      />
    </div>
  );
}

export default function TextInterview({ onFinish, onError, record, isMobile }) {
  const [messages, setMessages] = useState([]);   // {role, content}
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [started, setStarted] = useState(false);
  const endRef = useRef(null);
  const messagesRef = useRef([]);

  const exchanges = messages.filter((m) => m.role === "user").length;
  const atLimit = exchanges >= MAX_EXCHANGES;

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  const send = useCallback(async (history) => {
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${LANGGRAPH_URL}/onboarding/interview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) throw new Error(`Interview failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              acc += parsed.text;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: acc };
                return copy;
              });
            }
          } catch (err) {
            if (err instanceof SyntaxError) continue;  // partial JSON chunk
            throw err;
          }
        }
      }
      if (!acc.trim()) throw new Error("The interviewer didn't respond. Please try again.");
    } catch (err) {
      console.error("[TextInterview]", err);
      setMessages((m) => m.slice(0, -1));
      onError?.(err.message || "The interview hit a snag. Please try again.");
    } finally {
      setStreaming(false);
    }
  }, [onError]);

  useEffect(() => {
    if (started) return;
    setStarted(true);
    send([]);
  }, [started, send]);

  const submit = () => {
    const text = draft.trim();
    if (!text || streaming || atLimit) return;
    const next = [...messagesRef.current, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    send(next);
  };

  const finish = () => {
    const transcript = messagesRef.current
      .filter((m) => m.content.trim())
      .map((m) => `${m.role === "user" ? "Student" : "Interviewer"}: ${m.content.trim()}`)
      .join("\n\n");
    onFinish(transcript, exchanges);
  };

  return (
    <div style={{
      display: "flex", gap: "2.5rem", alignItems: "stretch",
      width: "100%", maxWidth: 1240, margin: "0 auto", padding: "0 1.5rem",
      flexDirection: isMobile ? "column" : "row",
      minHeight: 0, flex: 1,
    }}>
      {/* ── Left: the conversation ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>

        <Logo />
        <p style={eyebrowStyle}>A quick chat</p>
        <h1 style={{ ...titleStyle, fontSize: "2.3rem", marginBottom: "0.5rem" }}>
          Tell us more about what you do
        </h1>
        <p style={{ fontFamily: SANS, fontSize: "1.05rem", color: TEXT2, lineHeight: 1.6, marginBottom: "1.6rem" }}>
          Quick questions about the activities and awards you listed. Short answers are fine.
        </p>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 160, paddingRight: 4 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 16 }}>
              <div style={{
                maxWidth: "85%", fontFamily: SANS, fontSize: "1.05rem", lineHeight: 1.6,
                padding: "14px 18px", borderRadius: 18,
                background: m.role === "user" ? ACCENT : "#fff",
                color: m.role === "user" ? "#fff" : TEXT,
                border: m.role === "user" ? "none" : `1px solid ${BORDER}`,
                boxShadow: m.role === "user" ? "0 4px 16px rgba(29,78,216,0.25)" : "0 1px 6px rgba(15,23,42,0.05)",
                whiteSpace: "pre-wrap",
              }}>
                {m.content || (
                  <span style={{ display: "inline-flex", gap: 5 }}>
                    {[0, 1, 2].map((d) => (
                      <motion.span key={d}
                        animate={{ opacity: [0.25, 1, 0.25] }}
                        transition={{ duration: 1.1, repeat: Infinity, delay: d * 0.18 }}
                        style={{ width: 7, height: 7, borderRadius: "50%", background: TEXT3 }} />
                    ))}
                  </span>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div style={{ paddingTop: 14 }}>
          {atLimit ? (
            <p style={{ fontFamily: SANS, fontSize: "1rem", color: TEXT2, textAlign: "center", marginBottom: 13 }}>
              That's everything we need.
            </p>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="Type your answer…"
                rows={1}
                disabled={streaming}
                style={{
                  flex: 1, fontFamily: SANS, fontSize: "1.05rem", color: TEXT, lineHeight: 1.5,
                  border: `1.5px solid ${BORDER}`, borderRadius: 14, padding: "14px 16px",
                  outline: "none", resize: "none", background: "#fff", maxHeight: 160,
                }}
                onFocus={(e) => (e.target.style.borderColor = ACCENT)}
                onBlur={(e) => (e.target.style.borderColor = BORDER)}
              />
              <button type="button" onClick={submit} disabled={!draft.trim() || streaming}
                style={{
                  fontFamily: SANS, fontSize: "1.02rem", fontWeight: 700,
                  cursor: draft.trim() && !streaming ? "pointer" : "not-allowed",
                  padding: "15px 24px", borderRadius: 14, border: "none",
                  background: draft.trim() && !streaming ? ACCENT : "#c7d2e8", color: "#fff",
                }}>
                Send
              </button>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 13, gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: SANS, fontSize: "0.9rem", color: TEXT3 }}>
              {exchanges} of {MAX_EXCHANGES} answers
            </span>
            <button type="button" onClick={finish} disabled={streaming || exchanges === 0}
              style={{
                fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700,
                cursor: streaming || exchanges === 0 ? "not-allowed" : "pointer",
                background: atLimit ? ACCENT : "none",
                color: atLimit ? "#fff" : TEXT2,
                border: atLimit ? "none" : `1.5px solid ${BORDER}`,
                padding: "11px 22px", borderRadius: 12,
                opacity: exchanges === 0 ? 0.5 : 1,
              }}>
              {atLimit ? "See what we found" : "I'm done, wrap up"}
            </button>
          </div>
        </div>
      </motion.div>

      {/* ── Right: their record, so they can see what we're asking about ── */}
      <div style={{ flex: isMobile ? "1 1 auto" : "0 0 340px", width: "100%", maxWidth: isMobile ? "none" : 340 }}>
        <RecordPanel sections={sectionsFromRecord(record)} sticky={!isMobile} />
      </div>
    </div>
  );
}
