import { useId, useRef, useState } from "react";
import {
  COMMON_APP_PROMPTS, LIMIT_MAX, LIMIT_MIN, PROMPTS_NOTE, promptLabel, wordBounds,
} from "../../../../lib/essay.js";
import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import { Button, Card, FieldLabel, INPUT_CLASS, inputStyle } from "../../../ui/kit.jsx";
import {
  BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../../ui/tokens.js";
import { PROMPT_MAX, PROMPT_MIN } from "./editorUi.js";

// The prompt, always in view above the essay: what the student is answering,
// in the prompt's own words. A personal statement can switch between the seven
// Common App prompts (or go back to "decide later"); a supplement can fix the
// prompt the student pasted and its word limit. Nothing is looked up: the
// seven ship as data, and a school's prompt is whatever the student gives.
//
// A picked prompt is saved at once. A supplement's prompt and limit are saved
// together from a small form, so a half-typed prompt never becomes the one
// Quill reads against.

const quietButton = {
  minHeight: 44, padding: "0 14px", borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: WHITE,
  color: TEXT_MID, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer", flexShrink: 0,
};

/** The seven prompts as a list of buttons, the current one marked, plus
 *  "Decide later". Picking one closes the list. */
function PromptChooser({ value, undecided, onPick }) {
  const ink = useAgentInk();
  const row = (on) => ({
    display: "block", width: "100%", textAlign: "left", cursor: "pointer", boxSizing: "border-box", minHeight: 44,
    padding: "10px 12px", borderRadius: RADIUS.control, border: `1.5px solid ${on ? ink.ring : BORDER}`,
    background: on ? ink.softer : WHITE, fontFamily: SANS,
  });
  const head = { display: "flex", alignItems: "center", gap: 8, fontSize: "1rem", fontWeight: 800, color: TEXT, lineHeight: 1.35 };
  const body = { display: "block", marginTop: 4, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.55 };
  const tick = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, marginLeft: "auto", flexShrink: 0, fontSize: "0.9rem",
      fontWeight: 800, color: ink.onSoft }}>
      <PixelStamp kind="check" size={16} />
      Yours now
    </span>
  );
  return (
    <div role="group" aria-label="Common App prompts" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
      {COMMON_APP_PROMPTS.map((p) => {
        const on = value === p.key;
        return (
          <button key={p.key} type="button" className={FOCUS_CLASS} aria-pressed={on} onClick={() => onPick(p)} style={row(on)}>
            <span style={head}>
              <span>Prompt {p.key}: {p.short}</span>
              {on && tick}
            </span>
            <span style={body}>{p.text}</span>
          </button>
        );
      })}
      <button type="button" className={FOCUS_CLASS} aria-pressed={undecided} onClick={() => onPick(null)} style={row(undecided)}>
        <span style={head}>
          <span>Decide later</span>
          {undecided && tick}
        </span>
        <span style={body}>Write first, and pick a prompt before you ask Quill to read it.</span>
      </button>
    </div>
  );
}

/** A supplement's prompt and word limit, saved together. The same two rules
 *  the backend applied when the essay was made. */
function SupplementForm({ essay, onSave, onCancel }) {
  const uid = useId();
  const [text, setText] = useState(essay.prompt_text || "");
  const [limit, setLimit] = useState(String(wordBounds(essay).max));
  const [tried, setTried] = useState(false);
  const clean = text.trim();
  const n = Number(limit.trim());
  const textOk = clean.length >= PROMPT_MIN && clean.length <= PROMPT_MAX;
  const limitOk = /^\d+$/.test(limit.trim()) && n >= LIMIT_MIN && n <= LIMIT_MAX;
  const problem = { margin: "6px 0 0", fontFamily: SANS, fontSize: "0.93rem", fontWeight: 700, color: DANGER, lineHeight: 1.45 };

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (textOk && limitOk) onSave({ prompt_text: clean, word_limit: n });
  };

  return (
    <form onSubmit={submit} noValidate style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <FieldLabel htmlFor={`${uid}-text`} hint="Paste it exactly as the school gives it.">The school's prompt</FieldLabel>
        <textarea id={`${uid}-text`} className={INPUT_CLASS} value={text} maxLength={PROMPT_MAX} rows={4}
          aria-invalid={tried && !textOk ? true : undefined} aria-describedby={tried && !textOk ? `${uid}-text-problem` : undefined}
          onChange={(e) => setText(e.target.value)}
          style={{ ...inputStyle, minHeight: 112, resize: "vertical" }} />
        {tried && !textOk && (
          <p id={`${uid}-text-problem`} role="alert" style={problem}>
            Paste the school's prompt, {PROMPT_MIN} to {PROMPT_MAX} characters.
          </p>
        )}
      </div>
      <div>
        <FieldLabel htmlFor={`${uid}-limit`} hint="The most words the school allows for this answer.">Word limit</FieldLabel>
        <input id={`${uid}-limit`} className={INPUT_CLASS} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={4}
          value={limit} aria-invalid={tried && !limitOk ? true : undefined}
          aria-describedby={tried && !limitOk ? `${uid}-limit-problem` : undefined}
          onChange={(e) => setLimit(e.target.value)} style={{ ...inputStyle, maxWidth: 140 }} />
        {tried && !limitOk && (
          <p id={`${uid}-limit-problem`} role="alert" style={problem}>
            Set the word limit, from {LIMIT_MIN} to {LIMIT_MAX}.
          </p>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Button kind="primary" type="submit">Save prompt</Button>
        <Button kind="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

/**
 * essay: the essay as it is on screen (its kind, school, prompt and limit).
 * onChange(patch): a new prompt (prompt_key and prompt_text together), or a
 * supplement's prompt_text and word_limit. locked: nothing can be changed
 * (the essay is gone).
 */
export default function PromptPanel({ essay, onChange, locked = false }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const toggle = useRef(null);
  const personal = essay.kind === "personal_statement";
  const text = (essay.prompt_text || "").trim();
  const school = typeof essay.school_name === "string" ? essay.school_name.trim() : "";
  // A personal statement made with its own wording and no prompt number
  // still has a prompt: say so rather than "No prompt yet".
  const heading = personal ? (essay.prompt_key || !text ? promptLabel(essay) : "Your prompt")
    : school ? `Prompt from ${school}` : "The prompt";

  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };
  const pick = (p) => {
    const next = p ? { prompt_key: p.key, prompt_text: p.text } : { prompt_key: null, prompt_text: "" };
    if (next.prompt_key !== (essay.prompt_key || null) || next.prompt_text !== (essay.prompt_text || "")) onChange?.(next);
    close();
  };
  const saveSupplement = (patch) => {
    onChange?.(patch);
    close();
  };

  const toggleLabel = open ? "Close"
    : personal ? (text ? "Change prompt" : "Pick a prompt")
      : (text ? "Edit prompt and limit" : "Add the prompt");

  return (
    <Card as="section" aria-labelledby={`${uid}-title`} style={{ background: SURFACE, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "6px 12px" }}>
        <h2 id={`${uid}-title`} style={{ margin: 0, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT,
          lineHeight: 1.3, overflowWrap: "anywhere", minWidth: 0 }}>
          {heading}
        </h2>
        {!locked && (
          <button ref={toggle} type="button" className={FOCUS_CLASS} aria-expanded={open} aria-controls={`${uid}-change`}
            onClick={() => setOpen((v) => !v)} style={quietButton}>
            {toggleLabel}
          </button>
        )}
      </div>

      <p style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, lineHeight: 1.6,
        color: text ? TEXT_MID : TEXT_MUTED, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxWidth: "70ch" }}>
        {text || (personal
          ? "You haven't picked a prompt yet. You can write first, but Quill needs a prompt before it can read your draft."
          : "There is no prompt here yet. Paste the school's prompt so Quill knows what you are answering.")}
      </p>
      {personal ? (
        <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
          {PROMPTS_NOTE}
        </p>
      ) : (
        <p style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: TEXT_MUTED, lineHeight: 1.5,
          fontVariantNumeric: "tabular-nums" }}>
          Word limit: {wordBounds(essay).max}. Both come from you: Quill never looks anything up about a school.
        </p>
      )}

      <div id={`${uid}-change`}>
        {open && !locked && (personal
          ? <PromptChooser value={essay.prompt_key || null} undecided={!essay.prompt_key && !text} onPick={pick} />
          : <SupplementForm essay={essay} onSave={saveSupplement} onCancel={close} />)}
      </div>
    </Card>
  );
}
