import { useEffect, useRef, useState } from "react";
import Sheet from "./Sheet.jsx";
import { Button, Notice } from "./flowUi.jsx";
import { MascotSays } from "../SpeechBubble.jsx";
import { BEAKER_LINES } from "../../../lib/agents/registry.js";
import { agentErrorMessage, needsGmail } from "../../../lib/agentsApi.js";
import { BORDER, RADIUS, SANS, SURFACE, TEXT, TEXT_MUTED } from "../agentUi.js";

// The last stop before an email leaves: who it is from, who it goes to, the
// subject, and a reminder that it can't be unsent. Nothing is sent until
// "Send now" is pressed here, and focus starts on "Not yet" so a stray Enter
// sends nothing. While it sends, the sheet can't be closed.

// Refusals worth pressing Send again for. The rest won't change on a retry.
const RETRY = new Set(["network", "send_failed", "busy", "server_error", "error", "budget_unavailable"]);

// The way out when Gmail can't send this one again: the email may already be
// out, and if it isn't, it can still go by hand.
const BY_HAND = "If it isn't in your Gmail Sent folder, copy the email or open it in your mail app, then press Mark as sent.";

/** What the sheet says about a refusal. Where Gmail may have sent it, the
 *  words depend on what a second press would do: a first email is never sent
 *  twice, a follow-up could be. */
function refusalText(e, kind) {
  const code = e?.code || "error";
  if (code === "send_unconfirmed" && kind === "followup") {
    return "Gmail didn't confirm the follow-up, so it may have gone out. Check your Gmail Sent folder before you send it again.";
  }
  const text = agentErrorMessage(e);
  return code === "already_emailed" && kind === "first" ? `${text} ${BY_HAND}` : text;
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", gap: 12, padding: "8px 0", borderTop: `1px solid ${BORDER}`, minWidth: 0 }}>
      <dt style={{ flex: "0 0 76px", fontWeight: 800, color: TEXT_MUTED, fontSize: "0.95rem" }}>{label}</dt>
      <dd style={{ margin: 0, flex: 1, minWidth: 0, fontWeight: 600, color: TEXT, fontSize: "1rem", overflowWrap: "anywhere" }}>
        {children}
      </dd>
    </div>
  );
}

/**
 * kind: "first" | "followup". onConfirm(): async, sends; throws an
 * AgentApiError on a refusal. When the outcome was unclear (the answer was
 * lost, Gmail didn't confirm) the page reads the card again before it
 * throws, and resolves instead if the email turned out to be sent.
 * onNeedGmail(err): the refusal means Gmail must be connected again (the
 * page swaps this sheet for the Gmail one).
 */
export default function SendSheet({ kind = "first", from, to, subject, uncheckedCount = 0, onConfirm, onClose, onNeedGmail }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);   // { code, message }
  const actions = useRef(null);

  const send = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await onConfirm();
    } catch (e) {
      if (needsGmail(e)) { setBusy(false); onNeedGmail?.(e); return; }
      setError({ code: e?.code || "error", message: refusalText(e, kind) });
      setBusy(false);
    }
  };

  // The pressed button was disabled while sending, which drops focus. After a
  // refusal, put it back on the next thing to press (Try again, or Close).
  useEffect(() => {
    if (error) actions.current?.querySelector("button:not([disabled])")?.focus();
  }, [error]);

  const canRetry = !error || RETRY.has(error.code);

  return (
    <Sheet onClose={busy ? undefined : onClose} locked={busy} labelledBy="oa-send-title" width={500}>
      <h2 id="oa-send-title" style={{ margin: "0 0 14px", fontFamily: SANS, fontWeight: 800, fontSize: "1.35rem", color: TEXT }}>
        {kind === "followup" ? "Send this follow-up?" : "Send this email?"}
      </h2>
      <MascotSays state="delivering" size={72} layout="auto">{BEAKER_LINES.sendConfirm}</MascotSays>

      <dl style={{ margin: "16px 0 0", padding: "4px 14px", background: SURFACE, border: `1px solid ${BORDER}`,
        borderRadius: RADIUS.control, fontFamily: SANS }}>
        <Row label="From">{from || "Your Gmail"}</Row>
        <Row label="To">{to}</Row>
        <Row label="Subject">{subject}</Row>
      </dl>
      {kind === "followup" && (
        <p style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
          It goes as a reply in the same thread as your first email.
        </p>
      )}

      {uncheckedCount > 0 && !error && (
        <Notice tone="warn" style={{ marginTop: 14 }}>
          {uncheckedCount === 1
            ? "You haven't ticked 1 fact to check yet. You can still send, but it's worth a look."
            : `You haven't ticked ${uncheckedCount} facts to check yet. You can still send, but they're worth a look.`}
        </Notice>
      )}
      {error && <Notice tone={error.code === "send_unconfirmed" ? "warn" : "error"} style={{ marginTop: 14 }}>{error.message}</Notice>}

      <div ref={actions} style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
        {canRetry && (
          <Button kind="primary" busy={busy} onClick={send} style={{ flex: "1 1 180px" }}>
            {busy ? "Sending..." : error ? "Try again" : "Send now"}
          </Button>
        )}
        <Button kind="secondary" disabled={busy} onClick={onClose} data-autofocus style={{ flex: "1 1 180px" }}>
          {canRetry ? "Not yet" : "Close"}
        </Button>
      </div>
    </Sheet>
  );
}
