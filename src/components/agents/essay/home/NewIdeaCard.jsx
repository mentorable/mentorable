import { useEffect, useId, useRef, useState } from "react";
import { BORDER, RADIUS, SANS, TEXT, WHITE, useAgentInk } from "../../../ui/tokens.js";
import { Button, FieldLabel, INPUT_CLASS, Notice, inputStyle } from "../../../ui/kit.jsx";
import { countChars } from "../../../../lib/essay.js";
import { CharCount } from "./homeParts.jsx";
import { AREA_MAX, AREA_MIN, NOTES_MAX, RULE, ruledStyle } from "./homeUi.js";

// A blank card for an idea of the student's own: a name and, if they like,
// some notes. Free: no model reads it. It opens at the top of the ideas with
// focus in the name, and whatever was typed stays put if the save fails.
// The placeholders name no example topic on purpose: the idea is theirs.

/**
 * onAdd({ area, notes }): async; throws an Error whose message is fit to
 * show. onCancel(): put the blank card away.
 */
export default function NewIdeaCard({ onAdd, onCancel }) {
  const ink = useAgentInk();
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const [area, setArea] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);   // { text, tone }
  const areaRef = useRef(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    areaRef.current?.focus();
    return () => { mounted.current = false; };
  }, []);

  const name = area.replace(/\s+/g, " ").trim();
  // Counted as the database counts it, so a name of one emoji (one character
  // there, two by a string's own length) is asked for a second character here
  // rather than refused on the way in.
  const size = countChars(name);
  const ready = size >= AREA_MIN && size <= AREA_MAX;
  const empty = !area.trim() && !notes.trim();

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    if (!ready) {
      setError({ text: `Name the idea in ${AREA_MIN} to ${AREA_MAX} characters.`, tone: "warn" });
      areaRef.current?.focus();
      return;
    }
    setBusy(true); setError(null);
    try {
      await onAdd({ area: name, notes });
    } catch (err) {
      if (!mounted.current) return;
      setError({ text: err?.message || "Couldn't add that idea. Try again.", tone: "error" });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} aria-labelledby={id("title")} noValidate
      // Escape puts an untouched card away; one with words on it stays.
      onKeyDown={(e) => { if (e.key === "Escape" && !busy && empty) { e.stopPropagation(); onCancel?.(); } }}
      style={{ background: WHITE, borderRadius: RADIUS.card, boxSizing: "border-box", minWidth: 0,
        padding: "14px 16px 16px 18px", borderStyle: "solid", borderWidth: "1px 1px 1px 4px",
        borderColor: `${BORDER} ${BORDER} ${BORDER} ${ink.ring}` }}>
      <h3 id={id("title")} style={{ margin: "0 0 12px", fontFamily: SANS, fontSize: "1.15rem", fontWeight: 800, color: TEXT,
        letterSpacing: "-0.01em", lineHeight: 1.3 }}>
        A new idea
      </h3>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <FieldLabel htmlFor={id("area")} hint="A few words for the part of your life it is about.">What is it about?</FieldLabel>
        {area.length > AREA_MAX * 0.75 && <span style={{ marginBottom: 6 }}><CharCount n={area.length} max={AREA_MAX} /></span>}
      </div>
      <input ref={areaRef} id={id("area")} type="text" className={INPUT_CLASS} value={area} maxLength={AREA_MAX}
        autoComplete="off" aria-invalid={error && !ready ? true : undefined}
        aria-describedby={error ? id("error") : undefined}
        onChange={(e) => { setArea(e.target.value); if (error) setError(null); }}
        placeholder="A few words is enough"
        style={inputStyle} />

      <div style={{ marginTop: 14 }}>
        <FieldLabel htmlFor={id("notes")} optional>Notes</FieldLabel>
        <textarea id={id("notes")} className={INPUT_CLASS} value={notes} maxLength={NOTES_MAX} rows={3}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Whatever comes to mind. Half sentences are fine."
          style={{ ...inputStyle, ...ruledStyle, display: "block", minHeight: RULE * 3 + 20, resize: "vertical" }} />
      </div>

      {error && (
        <Notice tone={error.tone} style={{ marginTop: 12 }}><span id={id("error")}>{error.text}</span></Notice>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
        <Button kind="primary" type="submit" busy={busy}>{busy ? "Adding..." : "Add to my ideas"}</Button>
        <Button kind="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
