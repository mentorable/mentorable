import { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { supabase } from "../../lib/supabase.js";
import RecordPanel, { sectionsFromRecord } from "./RecordPanel.jsx";
import { Button, Notice, Tip } from "../ui/kit.jsx";
import {
  INPUT_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, inputStyle, subtitleStyle, titleStyle, useIntakeInk,
} from "./intakeTheme.js";

const LANGGRAPH_URL = import.meta.env.VITE_LANGGRAPH_CHAT_URL;

// The interviewer is prompted to wrap by ~9 exchanges; this is the hard stop.
const MAX_EXCHANGES = 12;

function Logo() {
  const ink = useIntakeInk();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.5rem" }}>
      <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1.1rem", color: TEXT, letterSpacing: "-0.04em" }}>
        mentorable
      </span>
      <span aria-hidden="true" style={{
        width: 7, height: 7, borderRadius: "50%", background: ink.accent, display: "inline-block", flexShrink: 0,
      }} />
    </div>
  );
}

export default function TextInterview({ onFinish, record, isMobile }) {
  const ink = useIntakeInk();
  const [messages, setMessages] = useState([]);   // {role, content}
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [started, setStarted] = useState(false);
  const [sendError, setSendError] = useState(null);
  const endRef = useRef(null);
  const messagesRef = useRef([]);
  const lastHistoryRef = useRef([]);   // what to resend if a request drops

  const exchanges = messages.filter((m) => m.role === "user").length;
  const atLimit = exchanges >= MAX_EXCHANGES;

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  const send = useCallback(async (history) => {
    lastHistoryRef.current = history;
    setSendError(null);
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
      // Kept in this component rather than raised to the parent: sending the
      // error up swapped this screen for the generic error phase, which
      // unmounted the conversation, so one dropped request cost the student
      // every exchange so far. A retry here resends the same history.
      setSendError(err.message || "That didn't go through.");
    } finally {
      setStreaming(false);
    }
  }, []);

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
      width: "100%", maxWidth: 1240, margin: "0 auto", padding: isMobile ? "0 1rem" : "0 1.5rem", boxSizing: "border-box",
      flexDirection: isMobile ? "column" : "row",
      minHeight: 0, flex: 1,
    }}>
      {/* ── Left: the conversation ── */}
      <motion.div
        initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>

        <Logo />
        <h1 style={{ ...titleStyle(ink, isMobile), fontSize: isMobile ? "1.9rem" : "2.3rem" }}>
          Tell us more about what you do
        </h1>
        <p style={{ ...subtitleStyle(isMobile), marginBottom: "1.4rem" }}>
          Quick questions about the activities and awards you listed. Short answers are fine.
        </p>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 160, paddingRight: 4 }}>
          {/* The interviewer speaks in the kit's dialog box, the student's own
              answers sit on the right in a soft tint of their accent. */}
          {messages.map((m, i) => m.role === "user" ? (
            <div key={i} style={{ display: "flex", justifyContent: "flex-end", margin: "4px 0 16px" }}>
              <div style={{
                maxWidth: "85%", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 500, lineHeight: 1.6,
                padding: "12px 16px", borderRadius: RADIUS.card, background: ink.soft, color: TEXT,
                border: `1px solid ${ink.soft}`, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
              }}>
                {m.content}
              </div>
            </div>
          ) : (
            <Tip key={i} name="Mentorable" stamp="chat" tone="default" style={{ marginBottom: 12, paddingRight: isMobile ? 0 : "10%" }}>
              {m.content ? <span style={{ whiteSpace: "pre-wrap" }}>{m.content}</span> : (
                <span style={{ display: "inline-flex", gap: 5, padding: "6px 0" }}>
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d}
                      animate={{ opacity: [0.25, 1, 0.25] }}
                      transition={{ duration: 1.1, repeat: Infinity, delay: d * 0.18 }}
                      style={{ width: 7, height: 7, borderRadius: "50%", background: TEXT_MUTED }} />
                  ))}
                </span>
              )}
            </Tip>
          ))}
          <div ref={endRef} />
        </div>

        <div style={{ paddingTop: 14 }}>
          {sendError && (
            <Notice tone="error" style={{ marginBottom: 12 }}
              action={(
                <Button kind="secondary" onClick={() => send(lastHistoryRef.current)} disabled={streaming}>
                  Try again
                </Button>
              )}>
              {sendError} Your answers are still here.
            </Notice>
          )}
          {atLimit ? (
            <p style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT_MID, textAlign: "center", marginBottom: 13 }}>
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
                className={INPUT_CLASS}
                style={{
                  ...inputStyle, flex: 1, width: "auto", minWidth: 0, fontSize: "1.05rem",
                  padding: "12px 14px", minHeight: 50, resize: "none", maxHeight: 160,
                }}
              />
              <Button kind="primary" onClick={submit} disabled={!draft.trim() || streaming}
                style={{ minHeight: 50, padding: "10px 22px", flexShrink: 0 }}>
                Send
              </Button>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 13, gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
              {exchanges} of {MAX_EXCHANGES} answers
            </span>
            <Button kind={atLimit ? "primary" : "secondary"} onClick={finish} disabled={streaming || exchanges === 0}>
              {atLimit ? "See what we found" : "I'm done, wrap up"}
            </Button>
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
