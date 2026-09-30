import { useEffect, useRef } from "react";
import { MascotSays } from "../SpeechBubble.jsx";
import { BEAKER_LINES } from "../../../lib/agents/registry.js";
import { formatDay, parseDay } from "../../../lib/quest.js";
import { AMBER_TEXT, SANS, TEXT_MUTED } from "../agentUi.js";
import { Button, Card, Counter, FieldLabel, Heading, INPUT_CLASS, LinkButton, Notice, inputStyle } from "./flowUi.jsx";
import { FOLLOWUP_MAX, FOLLOWUP_MAX_WORDS, wordCount } from "./options.js";

// After the first email: no reply is normal. Until day 10 Beaker just counts
// down; then it can draft a short follow-up (two or three sentences) that
// goes in the same Gmail thread, or out through Copy or the mail app when
// the first email went that way. Two follow-ups at most, 10 days apart.
//
// Only while the card is in Sent. Once the student has moved it on (they
// wrote back, a meeting is set, it's closed), there's nobody to nudge, and
// the panel says so instead of counting down.

// What the panel says for a card that has left Sent. Anything else not in
// Sent (moved back to To contact or Drafted) gets the last line.
const NOT_WAITING = {
  heard_back: "They wrote back, so there's nothing to follow up on. Keep the conversation going from your email.",
  meeting: "You've set up a meeting or got what you needed, so there's no follow-up to send.",
  closed: "This one's closed, so I won't count down to a follow-up.",
  other: "This card isn't in Sent on your board, so I'm not counting down to a follow-up. Move it back to Sent if you still want to follow up.",
};

/** Whole days from today (local) until an API calendar date. */
export function daysUntil(iso, today = new Date()) {
  const d = parseDay(iso);
  if (!d) return 0;
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((d - t) / 86400000);
}

/**
 * contact: the card. text / onText: the follow-up in the editor (starts as
 * the card's followup_body). gmail: { configured, connected, email }, where
 * null means it couldn't be checked (Send is still offered; the send itself
 * says if Gmail needs connecting). onMarkSent: "I sent it", for a follow-up
 * sent from the student's own mail (the page counts it toward the two).
 * Every action is the page's.
 */
export default function FollowUpPanel({
  contact, gmail, text, onText, drafting, onDraft, error, onSendGmail, onConnectGmail, onCopy, copied, mailto,
  onMarkSent, marking, today,
}) {
  const left = Number.isFinite(contact.followups_left) ? contact.followups_left : 0;
  const draftsLeft = Number.isFinite(contact.followup_drafts_left) ? contact.followup_drafts_left : 0;
  const days = contact.next_followup_on ? daysUntil(contact.next_followup_on, today) : 0;
  const viaGmail = contact.sent_via === "gmail" && !!contact.sent_at;
  const words = wordCount(text);
  const over = words > FOLLOWUP_MAX_WORDS;
  const empty = !text.trim();

  // "Draft a follow-up" is disabled while Beaker writes, which drops focus.
  // When it's done, put focus where the student goes next: the draft to read,
  // or back on the button if it failed.
  const area = useRef(null);
  const draftRow = useRef(null);
  const wasDrafting = useRef(false);
  useEffect(() => {
    if (wasDrafting.current && !drafting) {
      const lost = !document.activeElement || document.activeElement === document.body;
      const button = draftRow.current?.querySelector("button:not([disabled])");
      if (lost) (!error && text.trim() ? area.current : button)?.focus();
    }
    wasDrafting.current = drafting;
  }, [drafting, text, error]);

  let body;
  if (contact.stage !== "sent") {
    body = (
      <MascotSays state="idle" size={72} layout="auto">{NOT_WAITING[contact.stage] || NOT_WAITING.other}</MascotSays>
    );
  } else if (left <= 0) {
    body = (
      <MascotSays state="idle" size={72} layout="auto">
        You've sent both follow-ups. If they don't reply, that's okay. People get busy, and you did this the right way.
      </MascotSays>
    );
  } else if (days > 0) {
    body = (
      <>
        <MascotSays state="sleeping" size={72} layout="auto">{BEAKER_LINES.followupCountdown(days)}</MascotSays>
        <p style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600, color: TEXT_MUTED }}>
          You can follow up on {formatDay(contact.next_followup_on)}.
        </p>
      </>
    );
  } else {
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <MascotSays state="delivering" size={72} layout="auto">{BEAKER_LINES.followupReady}</MascotSays>
        <div ref={draftRow} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <Button kind={empty ? "primary" : "secondary"} busy={drafting} disabled={draftsLeft <= 0} onClick={onDraft}>
            {drafting ? "Drafting..." : empty ? "Draft a follow-up" : "Draft it again"}
          </Button>
          <span style={{ fontFamily: SANS, fontSize: "0.93rem", fontWeight: 700, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
            {draftsLeft > 0 ? `${draftsLeft} of 3 drafts left` : "No drafts left. You can write one yourself."}
          </span>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div>
          <FieldLabel htmlFor="oa-followup" hint={`Two or three sentences, up to ${FOLLOWUP_MAX_WORDS} words. It goes as a reply to your first email.`}>
            Your follow-up
          </FieldLabel>
          <textarea ref={area} id="oa-followup" className={INPUT_CLASS} rows={5} maxLength={FOLLOWUP_MAX} value={text}
            aria-describedby="oa-followup-count" onChange={(e) => onText(e.target.value)}
            placeholder="Hi Dr. Lee, I wanted to follow up on my note from last week..."
            style={{ ...inputStyle, resize: "vertical", minHeight: 130 }} />
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 4 }}>
            <span style={{ fontFamily: SANS, fontSize: "0.93rem", fontWeight: 600, color: over ? AMBER_TEXT : TEXT_MUTED }}>
              {over ? `That's over ${FOLLOWUP_MAX_WORDS} words. Shorter lands better.` : ""}
            </span>
            <Counter id="oa-followup-count" n={words} max={FOLLOWUP_MAX_WORDS} unit=" words" />
          </div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {viaGmail && gmail?.connected !== false && (
            <Button kind="primary" disabled={empty || over} onClick={onSendGmail}>Send in the same thread</Button>
          )}
          {viaGmail && gmail?.connected === false && gmail?.configured && (
            <Button kind="primary" onClick={onConnectGmail}>Connect Gmail to send</Button>
          )}
          <Button kind="secondary" disabled={empty} onClick={onCopy}>
            {copied ? "Copied" : "Copy follow-up"}
          </Button>
          <LinkButton href={mailto} disabled={empty}>Open in my mail app</LinkButton>
          {!viaGmail && (
            <Button kind="secondary" busy={marking} onClick={onMarkSent} data-oa-mark-followup>I sent it</Button>
          )}
        </div>
        {!viaGmail && (
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.93rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
            {left > 1
              ? "Sent it from your own email? Press I sent it, so Beaker knows when one more is fair."
              : "Sent it from your own email? Press I sent it. It's the last follow-up for this one."}
          </p>
        )}
      </div>
    );
  }

  return (
    <Card as="section" aria-labelledby="oa-followup-title" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Heading id="oa-followup-title">Follow up</Heading>
      {body}
    </Card>
  );
}
