import { useRef, useState } from "react";
import { PixelArrow, PixelStamp } from "../PixelIcons.jsx";
import {
  BORDER, DANGER, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../agentUi.js";
import { Button, CHOICE_CLASS, Counter, FieldLabel, INPUT_CLASS, Notice, SR_ONLY, inputStyle } from "./flowUi.jsx";
import { BLOCK_COPY, LENGTHS, NOTE_MAX, PURPOSES, VOICES, researchBlock } from "./options.js";

const PURPOSE_MISSING = "Pick one, so Beaker knows what to ask for.";

// Step 3: what the email is for and how it sounds. Purpose (4), voice (4,
// each with the example opening it would write), length (2) and one
// optional line in the student's own words. Everything else Beaker knows
// about the student comes from their Portfolio record.

function RadioCards({
  name, legend, hint, options, value, onChange, columns = "repeat(auto-fit, minmax(240px, 1fr))", render,
  fieldsetRef, describedBy,
}) {
  const ink = useAgentInk();
  return (
    <fieldset ref={fieldsetRef} aria-describedby={describedBy}
      style={{ border: "none", margin: 0, padding: 0, minWidth: 0, scrollMarginTop: 16 }}>
      <legend style={{ padding: 0, marginBottom: hint ? 2 : 8, fontFamily: SANS, fontWeight: 800, fontSize: "1.1rem", color: TEXT }}>
        {legend}
      </legend>
      {hint && <p style={{ margin: "0 0 8px", fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.5 }}>{hint}</p>}
      <div style={{ display: "grid", gridTemplateColumns: columns, gap: 10 }}>
        {options.map((o) => {
          const on = value === o.key;
          return (
            <label key={o.key} className={CHOICE_CLASS}
              style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", borderRadius: RADIUS.control,
                padding: "12px 14px", background: on ? ink.softer : WHITE, border: `2px solid ${on ? ink.ring : BORDER}`,
                boxSizing: "border-box", minHeight: 44, minWidth: 0 }}>
              <input type="radio" name={name} value={o.key} checked={on} onChange={() => onChange(o.key)} style={SR_ONLY} />
              <span aria-hidden="true" style={{ flexShrink: 0, width: 20, height: 20, marginTop: 2, borderRadius: 99,
                border: `2px solid ${on ? ink.ring : "#8a857c"}`, background: WHITE, display: "flex", alignItems: "center",
                justifyContent: "center", boxSizing: "border-box" }}>
                {on && <span style={{ width: 10, height: 10, borderRadius: 99, background: ink.button.bg }} />}
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: "block", fontFamily: SANS, fontWeight: 800, fontSize: "1rem", color: TEXT }}>{o.label}</span>
                {o.hint && (
                  <span style={{ display: "block", marginTop: 2, fontFamily: SANS, fontSize: "0.93rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
                    {o.hint}
                  </span>
                )}
                {render?.(o, on)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function Example({ text }) {
  return (
    <span style={{ display: "block", marginTop: 8, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: "8px 10px", fontFamily: SANS, fontSize: "0.93rem", color: TEXT_MID, lineHeight: 1.55 }}>
      <span style={SR_ONLY}>Example opening: </span>
      &ldquo;{text}&rdquo;
    </span>
  );
}

/**
 * choices: { purpose, voice, length, note }. charge: true when "Research and
 * draft" starts a new try (a named person), false for a pick from a list
 * (no new try, but still a research run). tries, searches: the counts from
 * status, or null when unknown.
 */
export default function DetailsStep({
  who, onChangeWho, choices, onChoices, charge, tries, searches, busy, error, onSubmit,
}) {
  const ink = useAgentInk();
  const [tried, setTried] = useState(false);
  const purposeRef = useRef(null);
  const missing = !choices.purpose;
  const block = researchBlock({ tries, searches }, { charge });
  const blocked = !!block;

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (busy || blocked) return;
    if (missing) {
      // The purpose cards are the first thing in this long form, far above
      // this button: take the student (and focus) back up to them.
      const box = purposeRef.current;
      const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      box?.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
      box?.querySelector("input")?.focus({ preventScroll: true });
      return;
    }
    onSubmit();
  };

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {who && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", background: WHITE,
          border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "8px 8px 8px 14px" }}>
          <span style={{ flex: "1 1 200px", minWidth: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.5,
            overflowWrap: "anywhere" }}>
            Writing to <strong style={{ color: TEXT }}>{who.name}</strong>
            {who.organization ? `, ${who.organization}` : ""}
          </span>
          {onChangeWho && <Button kind="quiet" onClick={onChangeWho} disabled={busy}>Change</Button>}
        </div>
      )}

      <div>
        <RadioCards name="oa-purpose" legend="What would you like from them?" options={PURPOSES} value={choices.purpose}
          onChange={(purpose) => onChoices({ purpose })} columns="repeat(auto-fit, minmax(290px, 1fr))"
          fieldsetRef={purposeRef} describedBy={tried && missing ? "oa-purpose-error" : undefined} />
        {tried && missing && (
          <p id="oa-purpose-error" role="alert" style={{ margin: "8px 0 0", fontFamily: SANS, fontWeight: 700,
            fontSize: "0.98rem", color: DANGER }}>
            {PURPOSE_MISSING}
          </p>
        )}
      </div>

      <RadioCards name="oa-voice" legend="How should it sound?" hint="Each one shows how the email might open."
        options={VOICES} value={choices.voice} onChange={(voice) => onChoices({ voice })}
        columns="repeat(auto-fit, minmax(260px, 1fr))"
        render={(o) => <Example text={o.example} />} />

      <RadioCards name="oa-length" legend="How long?" options={LENGTHS} value={choices.length}
        onChange={(length) => onChoices({ length })} columns="repeat(auto-fit, minmax(200px, 1fr))" />

      <div>
        <FieldLabel htmlFor="oa-note" optional
          hint="One line in your own words, like a project you did or why this caught your interest. Beaker uses only your Portfolio and what you write here.">
          Anything Beaker should know?
        </FieldLabel>
        <textarea id="oa-note" className={INPUT_CLASS} rows={2} maxLength={NOTE_MAX} value={choices.note}
          aria-describedby="oa-note-count" onChange={(e) => onChoices({ note: e.target.value })}
          placeholder="I built a water-quality sensor for my school's pond last spring."
          style={{ ...inputStyle, resize: "vertical", minHeight: 70 }} />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
          <Counter id="oa-note-count" n={choices.note.length} max={NOTE_MAX} />
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {blocked && (
        <Notice tone="warn">
          <strong style={{ display: "block", fontWeight: 800 }}>{BLOCK_COPY[block].title}</strong>
          {BLOCK_COPY[block].line}
        </Notice>
      )}

      {/* Said again by the button, which may be a long way below the purpose
          cards; the alert up there is the one a screen reader hears. */}
      {tried && missing && !blocked && (
        <p style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: "0.98rem", color: DANGER }}>
          First, pick what you'd like from them, at the top of this step.
        </p>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <Button kind="primary" type="submit" busy={busy} disabled={blocked} style={{ minWidth: 200 }}>
          Research and draft
          {!busy && <PixelArrow size={16} />}
        </Button>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: "0.95rem",
          fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color: ink.text, display: "flex" }}><PixelStamp kind="letter" size={16} /></span>
          {charge
            ? (tries ? `Uses 1 of your ${tries.limit} tries (${tries.left} left).` : "Uses 1 of your tries.")
            : "Part of the try you already started. No extra cost."}
        </span>
      </div>
    </form>
  );
}
