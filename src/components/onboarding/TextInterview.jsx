import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabase.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

const SANS   = "'Raleway', sans-serif";
const TEXT   = "#0e1019";
const TEXT2  = "#4b5470";
const TEXT3  = "#5b6188";
const ACCENT = "#1d4ed8";
const BORDER = "rgba(59,91,252,0.18)";

// The interviewer is prompted to wrap by ~9 exchanges; this is the hard stop.
const MAX_EXCHANGES = 12;

export default function TextInterview({ onFinish, onError }) {
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
    // Placeholder the stream fills in.
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
      setMessages((m) => m.slice(0, -1));   // drop the empty placeholder
      onError?.(err.message || "The interview hit a snag. Please try again.");
    } finally {
      setStreaming(false);
    }
  }, [onError]);

  // Kick off the opening question once.
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
    <motion.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
      style={{ width: "100%", maxWidth: 680, margin: "0 auto", padding: "0 1.25rem",
               display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}
    >
      <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
        <h1 style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.5rem", color: TEXT, letterSpacing: "-0.02em", marginBottom: 5 }}>
          Let's talk it through
        </h1>
        <p style={{ fontFamily: SANS, fontSize: "0.92rem", color: TEXT2 }}>
          A few questions about what you've done and why it matters to you.
        </p>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingRight: 4 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 14 }}>
            <div style={{
              maxWidth: "85%", fontFamily: SANS, fontSize: "1rem", lineHeight: 1.6,
              padding: "12px 16px", borderRadius: 16,
              background: m.role === "user" ? ACCENT : "#fff",
              color: m.role === "user" ? "#fff" : TEXT,
              border: m.role === "user" ? "none" : `1px solid ${BORDER}`,
              whiteSpace: "pre-wrap",
            }}>
              {m.content || (
                <span style={{ display: "inline-flex", gap: 4 }}>
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d}
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: d * 0.18 }}
                      style={{ width: 6, height: 6, borderRadius: "50%", background: TEXT3 }} />
                  ))}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div style={{ paddingTop: 12 }}>
        {atLimit ? (
          <p style={{ fontFamily: SANS, fontSize: "0.9rem", color: TEXT2, textAlign: "center", marginBottom: 11 }}>
            That's everything we need.
          </p>
        ) : (
          <div style={{ display: "flex", gap: 9, alignItems: "flex-end" }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Type your answer…"
              rows={1}
              disabled={streaming}
              style={{
                flex: 1, fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.5,
                border: `1.5px solid ${BORDER}`, borderRadius: 13, padding: "12px 14px",
                outline: "none", resize: "none", background: "#fff", maxHeight: 140,
              }}
              onFocus={(e) => (e.target.style.borderColor = ACCENT)}
              onBlur={(e) => (e.target.style.borderColor = BORDER)}
            />
            <button type="button" onClick={submit} disabled={!draft.trim() || streaming}
              style={{
                fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
                cursor: draft.trim() && !streaming ? "pointer" : "not-allowed",
                padding: "13px 20px", borderRadius: 13, border: "none",
                background: draft.trim() && !streaming ? ACCENT : "#c7d2e8", color: "#fff",
              }}>
              Send
            </button>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 11, gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: SANS, fontSize: "0.82rem", color: TEXT3 }}>
            {exchanges} of {MAX_EXCHANGES} answers
          </span>
          <button type="button" onClick={finish} disabled={streaming || exchanges === 0}
            style={{
              fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700,
              cursor: streaming || exchanges === 0 ? "not-allowed" : "pointer",
              background: atLimit ? ACCENT : "none",
              color: atLimit ? "#fff" : TEXT2,
              border: atLimit ? "none" : `1.5px solid ${BORDER}`,
              padding: "9px 18px", borderRadius: 11,
              opacity: exchanges === 0 ? 0.5 : 1,
            }}>
            {atLimit ? "See what we found" : "I'm done, wrap up"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
