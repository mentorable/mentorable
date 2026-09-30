import { useEffect, useRef, useState } from "react";
import Sheet from "./Sheet.jsx";
import SafetyNote from "./SafetyNote.jsx";
import { Button, Notice } from "./flowUi.jsx";
import { MascotSays } from "../SpeechBubble.jsx";
import { BEAKER_LINES } from "../../../lib/agents/registry.js";
import { agentErrorMessage } from "../../../lib/agentsApi.js";
import { SANS, TEXT, TEXT_MID, TEXT_MUTED } from "../agentUi.js";

// Offered at the start of the first outreach (with the ground rules), again
// when the student presses Send without Gmail, and when Google stopped
// honouring the connection. Always skippable: without Gmail the draft stays
// in Mentorable, and Copy and "Open in my mail app" still work. When sending
// is not set up on the server (`gmail.configured` false) the Gmail part is
// hidden and only the ground rules show.

const RECONNECT_LINE = "Your Gmail connection stopped working. Connect it again and I can send for you. Your draft is safe here.";

const TITLES = {
  first: "Before your first letter",
  send: "Connect Gmail to send",
  reconnect: "Reconnect Gmail",
};

// If the browser is still here this long after heading to Google (the
// navigation was stopped, or Google is very slow), the buttons come back.
const STILL_HERE_MS = 15000;

/**
 * reason: "first" | "send" | "reconnect".
 * onConnect(): async; sends the browser to Google (it throws on a refusal).
 * onClose(): the student chose a button ("Not now", "Got it"): they have read it.
 * onDismiss(): the backdrop or Escape; defaults to onClose. The first-run
 *   sheet passes a separate one, so a stray tap closes it for now without
 *   marking the ground rules as read.
 */
export default function GmailConnectSheet({
  reason = "first", gmail, showSafety = reason === "first", onConnect, onClose, onDismiss,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const stillHere = useRef(null);
  const offerGmail = !!gmail?.configured && !gmail?.connected;
  const title = offerGmail ? TITLES[reason] || TITLES.first : TITLES.first;

  // Back from Google's page with Back: the browser may restore this page
  // exactly as it was left (the back/forward cache), still "Opening Google".
  useEffect(() => {
    const onShow = (e) => {
      if (!e.persisted) return;
      clearTimeout(stillHere.current);
      setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pageshow", onShow);
      clearTimeout(stillHere.current);
    };
  }, []);

  const connect = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await onConnect();
      // The browser is on its way to Google; stay busy until it leaves.
      clearTimeout(stillHere.current);
      stillHere.current = setTimeout(() => setBusy(false), STILL_HERE_MS);
    } catch (e) {
      setError(agentErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={busy ? undefined : (onDismiss || onClose)} locked={busy} labelledBy="oa-gmail-title">
      <h2 id="oa-gmail-title" style={{ margin: "0 0 14px", fontFamily: SANS, fontWeight: 800, fontSize: "1.35rem",
        color: TEXT, letterSpacing: "-0.01em" }}>
        {title}
      </h2>

      {offerGmail && (
        <>
          <MascotSays state={reason === "reconnect" ? "thinking" : "delivering"} size={72} layout="auto">
            {reason === "reconnect" ? RECONNECT_LINE : BEAKER_LINES.gmailPitch}
          </MascotSays>
          <ul style={{ listStyle: "disc", margin: "14px 0 0", padding: "0 0 0 1.25rem", fontFamily: SANS, fontSize: "0.98rem", color: TEXT_MID,
            lineHeight: 1.55, display: "flex", flexDirection: "column", gap: 4 }}>
            <li>Mentorable only asks Google for permission to send. It can't read, search or delete your email.</li>
            <li>Nothing goes out until you read the email and press Send.</li>
            <li>You can disconnect any time in Profile.</li>
          </ul>
          <p style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.55 }}>
            Google may warn that Mentorable isn't verified yet while its review is underway. School Google accounts
            sometimes block apps like this. Either way, you can copy the email or open it in your mail app instead.
          </p>
        </>
      )}

      {showSafety && (
        <div style={{ marginTop: offerGmail ? 16 : 0 }}>
          {!offerGmail && (
            <MascotSays state="idle" size={72} layout="auto" style={{ marginBottom: 14 }}>
              Before we start, the ground rules. They matter more than any email.
            </MascotSays>
          )}
          <SafetyNote headingId="oa-gmail-safety" />
        </div>
      )}

      {error && <Notice tone="error" style={{ marginTop: 14 }}>{error}</Notice>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
        {offerGmail ? (
          <>
            <Button kind="primary" busy={busy} onClick={connect} data-autofocus style={{ flex: "1 1 200px" }}>
              {busy ? "Opening Google..." : reason === "reconnect" ? "Reconnect Gmail" : "Connect Gmail"}
            </Button>
            <Button kind="secondary" disabled={busy} onClick={onClose} style={{ flex: "1 1 200px" }}>
              {reason === "first" ? "Not now, I'll save drafts here" : "Not now"}
            </Button>
          </>
        ) : (
          <Button kind="primary" onClick={onClose} data-autofocus style={{ flex: "1 1 200px" }}>
            Got it
          </Button>
        )}
      </div>
    </Sheet>
  );
}
