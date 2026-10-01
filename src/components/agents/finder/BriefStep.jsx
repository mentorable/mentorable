import { useEffect, useRef, useState } from "react";
import { MascotSays } from "../SpeechBubble.jsx";
import { PixelArrow, PixelStamp } from "../PixelIcons.jsx";
import {
  BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../agentUi.js";
import {
  Button, CHOICE_CLASS, Card, Counter, FieldLabel, INPUT_CLASS, Notice, SR_ONLY, inputStyle,
} from "../outreach/flowUi.jsx";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import {
  BUDGET, CHIPS, CITIZENSHIP, EFFORT, TRAVEL, WANT_MAX, WANT_MIN, WHEN,
} from "../../../lib/finder.js";
import { TALON, laneLabel } from "./finderUi.js";

// Step 2: the brief. What the student wants in their own words, their
// interests (prefilled from their record), grade and state, the lane's own
// preferences, and citizenship, which is always asked and always has a
// "not sure" answer. The eligibility chips sit behind a disclosure, are
// opt-in, and are used for this search only: the page never stores them, and
// neither does Talon.

export const INTERESTS_MAX = 5;
export const INTEREST_MAX = 60;
export const STATE_MAX = 40;

const GRADES = [
  { value: "9", label: "9th grade" }, { value: "10", label: "10th grade" },
  { value: "11", label: "11th grade" }, { value: "12", label: "12th grade" },
];

const EXAMPLES = {
  scholarship: [
    "Scholarships for students who want to study marine biology",
    "Scholarships in my state with a short essay or none",
  ],
  activity: [
    "A free or low-cost summer program in engineering",
    "Volunteering with animals on weekends near me",
  ],
};
const PLACEHOLDER = {
  scholarship: "Scholarships for a future nurse who volunteers at a hospital",
  activity: "A summer research program in biology I can do online",
};
const CHIP_GROUPS = [
  { key: "background", label: "Your background" },
  { key: "heritage", label: "Heritage" },
];

/** A set of radio choices drawn as pills. `id` lands on the fieldset, so
 *  the Check step's Edit links can come back to it. */
function PillRadios({ id, name, legend, hint, options, value, onChange, describedBy }) {
  const ink = useAgentInk();
  return (
    <fieldset id={id} aria-describedby={describedBy} tabIndex={-1}
      style={{ border: "none", margin: 0, padding: 0, minWidth: 0, outline: "none", scrollMarginTop: 16 }}>
      <legend style={{ padding: 0, marginBottom: hint ? 2 : 8, fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT }}>
        {legend}
      </legend>
      {hint && <p style={{ margin: "0 0 8px", fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.5 }}>{hint}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const on = value === o.key;
          return (
            <label key={o.key} className={CHOICE_CLASS}
              style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "8px 14px",
                borderRadius: RADIUS.pill, cursor: "pointer", boxSizing: "border-box", fontFamily: SANS,
                fontSize: "0.95rem", fontWeight: 700, lineHeight: 1.3, maxWidth: "100%",
                border: `1.5px solid ${on ? ink.ring : BORDER}`, background: on ? ink.softer : WHITE,
                color: on ? ink.onSoft : TEXT_MID }}>
              <input type="radio" name={name} value={o.key} checked={on} onChange={() => onChange(o.key)} style={SR_ONLY} />
              <span aria-hidden="true" style={{ flexShrink: 0, width: 16, height: 16, borderRadius: 99, boxSizing: "border-box",
                border: `2px solid ${on ? ink.ring : "#8a857c"}`, background: WHITE, display: "flex", alignItems: "center",
                justifyContent: "center" }}>
                {on && <span style={{ width: 8, height: 8, borderRadius: 99, background: ink.button.bg }} />}
              </span>
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 style={{ margin: "0 0 14px", fontFamily: SANS, fontSize: "1.1rem", fontWeight: 800, color: TEXT }}>{children}</h3>
  );
}

/**
 * brief: { lane, want, interests, grade, state, citizenship, budget, travel,
 * when, effort, chips }. onBrief(patch). onChangeLane(): back to step 1.
 * focusField: a field to focus on arrival (from the Check step's Edit
 * links), or null. onContinue(): the brief is ready to check.
 */
export default function BriefStep({ brief, onBrief, onChangeLane, error, focusField, onContinue }) {
  const ink = useAgentInk();
  const [tried, setTried] = useState(false);
  const [draft, setDraft] = useState("");            // the interest being typed
  const [interestNote, setInterestNote] = useState(null);
  const [chipsOpen, setChipsOpen] = useState(() => brief.chips.length > 0 || focusField === "chips");
  const wantRef = useRef(null);
  const interestRef = useRef(null);

  const lane = brief.lane;
  const wantLen = brief.want.trim().length;
  const wantProblem = wantLen < WANT_MIN
    ? `Tell Talon a little more: at least ${WANT_MIN} characters.`
    : wantLen > WANT_MAX ? `Keep it under ${WANT_MAX} characters.` : null;
  const citizenProblem = brief.citizenship ? null : "Pick one. \"Not sure / prefer not to say\" is fine.";

  // Back from the Check step's Edit link: focus what they wanted to change.
  // After a frame, so it lands after the page's own focus on the step heading.
  useEffect(() => {
    if (!focusField) return undefined;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`tf-${focusField}`);
      if (!el) return;
      const target = el.tagName === "FIELDSET" ? (el.querySelector("input:checked") || el.querySelector("input") || el) : el;
      target.focus?.();
      el.scrollIntoView?.({ block: "center" });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusField]);

  const addInterest = () => {
    const v = draft.trim().replace(/\s+/g, " ").slice(0, INTEREST_MAX);
    if (!v) return;
    if (brief.interests.some((i) => i.toLowerCase() === v.toLowerCase())) { setDraft(""); setInterestNote(`"${v}" is already on the list.`); return; }
    if (brief.interests.length >= INTERESTS_MAX) { setInterestNote(`Up to ${INTERESTS_MAX} interests. Remove one to add another.`); return; }
    onBrief({ interests: [...brief.interests, v] });
    setDraft("");
    setInterestNote(`Added ${v}.`);
    // Pressed from the Add button, which turns off with the box empty:
    // keep focus in the box, ready for the next one.
    interestRef.current?.focus();
  };
  const removeInterest = (v) => {
    onBrief({ interests: brief.interests.filter((i) => i !== v) });
    setInterestNote(`Removed ${v}.`);
    // The pressed chip is gone; the box is the next sensible place.
    interestRef.current?.focus();
  };

  const toggleChip = (key) => {
    const on = brief.chips.includes(key);
    onBrief({ chips: on ? brief.chips.filter((k) => k !== key) : [...brief.chips, key] });
  };

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (wantProblem) { wantRef.current?.focus(); return; }
    if (citizenProblem) {
      document.getElementById("tf-citizenship")?.querySelector("input")?.focus();
      return;
    }
    onContinue();
  };

  const chipLabel = lane === "scholarship"
    ? "Optional: things that open up more scholarships"
    : "Optional: things that open up more opportunities";

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MascotSays agent={TALON} state="idle" size={80} layout="auto">{TALON_LINES.briefAsk}</MascotSays>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px", background: WHITE,
        border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "8px 8px 8px 14px" }}>
        <span style={{ flex: "1 1 200px", minWidth: 0, fontFamily: SANS, fontSize: "1rem", color: TEXT_MID, lineHeight: 1.5 }}>
          Looking for <strong style={{ color: TEXT }}>{laneLabel(lane) || "opportunities"}</strong>
        </span>
        <Button kind="quiet" onClick={onChangeLane}>Change</Button>
      </div>

      <Card>
        <SectionTitle>What you're after</SectionTitle>
        <FieldLabel htmlFor="tf-want" hint="In your own words: the subject, the kind of thing, anything that matters to you.">
          What should Talon look for?
        </FieldLabel>
        <textarea id="tf-want" ref={wantRef} className={INPUT_CLASS} value={brief.want} maxLength={WANT_MAX} rows={3}
          aria-invalid={tried && !!wantProblem}
          aria-describedby={`tf-want-count${tried && wantProblem ? " tf-want-error" : ""}`}
          onChange={(e) => onBrief({ want: e.target.value })} placeholder={PLACEHOLDER[lane] || ""}
          style={{ ...inputStyle, resize: "vertical", minHeight: 96 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginTop: 4 }}>
          {tried && wantProblem ? (
            <p id="tf-want-error" role="alert" style={{ margin: 0, fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: DANGER }}>
              {wantProblem}
            </p>
          ) : <span />}
          <Counter id="tf-want-count" n={brief.want.length} max={WANT_MAX} />
        </div>
        {(EXAMPLES[lane] || []).length > 0 && (
          <>
            <p style={{ margin: "10px 0 8px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID }}>
              Or start from an example:
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EXAMPLES[lane].map((ex) => (
                <button key={ex} type="button" className={FOCUS_CLASS} aria-pressed={brief.want === ex}
                  onClick={() => onBrief({ want: ex })}
                  style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT, textAlign: "left",
                    background: brief.want === ex ? ink.soft : WHITE, border: `1.5px solid ${brief.want === ex ? ink.ring : BORDER}`,
                    borderRadius: RADIUS.control, padding: "9px 12px", minHeight: 44, cursor: "pointer", lineHeight: 1.4,
                    maxWidth: "100%" }}>
                  {ex}
                </button>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: 20 }}>
          <FieldLabel htmlFor="tf-interests" optional
            hint={`Up to ${INTERESTS_MAX}, like a subject or a hobby. Any majors on your record are already here.`}>
            Your interests
          </FieldLabel>
          {brief.interests.length > 0 && (
            <ul aria-label="Your interests" style={{ listStyle: "none", margin: "0 0 10px", padding: 0, display: "flex",
              flexWrap: "wrap", gap: 8 }}>
              {brief.interests.map((v) => (
                <li key={v} style={{ maxWidth: "100%" }}>
                  <button type="button" className={FOCUS_CLASS} onClick={() => removeInterest(v)}
                    aria-label={`Remove ${v}`}
                    style={{ minHeight: 44, maxWidth: "100%", padding: "6px 8px 6px 14px", display: "inline-flex",
                      alignItems: "center", gap: 8, borderRadius: RADIUS.pill, border: `1.5px solid ${ink.soft}`,
                      background: ink.softer, color: ink.onSoft, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700,
                      cursor: "pointer", textAlign: "left", overflowWrap: "anywhere" }}>
                    <span>{v}</span>
                    <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, borderRadius: 99, display: "inline-flex",
                      alignItems: "center", justifyContent: "center", background: WHITE }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2"
                        strokeLinecap="round" focusable="false"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input id="tf-interests" ref={interestRef} className={INPUT_CLASS} value={draft} maxLength={INTEREST_MAX} autoComplete="off"
              aria-describedby="tf-interests-note"
              onChange={(e) => { setDraft(e.target.value); setInterestNote(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addInterest(); } }}
              placeholder="Robotics" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
            <Button kind="secondary" onClick={addInterest} disabled={!draft.trim()}>Add</Button>
          </div>
          <p id="tf-interests-note" role="status" style={{ margin: interestNote ? "6px 0 0" : 0, fontFamily: SANS,
            fontSize: "0.92rem", fontWeight: 600, color: TEXT_MUTED }}>
            {interestNote}
          </p>
        </div>
      </Card>

      <Card>
        <SectionTitle>About you</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 14 }}>
          <div>
            <FieldLabel htmlFor="tf-grade">Grade</FieldLabel>
            <select id="tf-grade" className={INPUT_CLASS} value={brief.grade == null ? "" : String(brief.grade)}
              onChange={(e) => onBrief({ grade: e.target.value ? Number(e.target.value) : null })}
              style={{ ...inputStyle, cursor: "pointer" }}>
              <option value="">Prefer not to say</option>
              {GRADES.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
          <div>
            <FieldLabel htmlFor="tf-state" optional>State</FieldLabel>
            <input id="tf-state" className={INPUT_CLASS} value={brief.state} maxLength={STATE_MAX} autoComplete="off"
              aria-describedby="tf-state-hint"
              onChange={(e) => onBrief({ state: e.target.value })} placeholder="Florida" style={inputStyle} />
            <p id="tf-state-hint" style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
              {lane === "scholarship" ? "Many scholarships are for one state only." : "Helps with programs near you."}
            </p>
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <PillRadios id="tf-citizenship" name="tf-citizenship" legend="Citizenship status"
            hint="Some scholarships and programs need US citizenship or permanent residency. Used for this search only, never saved."
            options={CITIZENSHIP} value={brief.citizenship} onChange={(citizenship) => onBrief({ citizenship })}
            describedBy={tried && citizenProblem ? "tf-citizenship-error" : undefined} />
          {tried && citizenProblem && (
            <p id="tf-citizenship-error" role="alert" style={{ margin: "8px 0 0", fontFamily: SANS, fontWeight: 700,
              fontSize: "0.95rem", color: DANGER }}>
              {citizenProblem}
            </p>
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle>{lane === "scholarship" ? "What kind of application" : "What works for you"}</SectionTitle>
        {lane === "scholarship" ? (
          <PillRadios id="tf-effort" name="tf-effort" legend="How much writing?" options={EFFORT} value={brief.effort}
            onChange={(effort) => onBrief({ effort })} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <PillRadios id="tf-budget" name="tf-budget" legend="Budget" hint="Free and aided options always rank higher."
              options={BUDGET} value={brief.budget} onChange={(budget) => onBrief({ budget })} />
            <PillRadios id="tf-travel" name="tf-travel" legend="Where" options={TRAVEL} value={brief.travel}
              onChange={(travel) => onBrief({ travel })} />
            <PillRadios id="tf-when" name="tf-when" legend="When" options={WHEN} value={brief.when}
              onChange={(when) => onBrief({ when })} />
          </div>
        )}
      </Card>

      <Card style={{ padding: 0 }}>
        <button type="button" id="tf-chips" className={FOCUS_CLASS} aria-expanded={chipsOpen} aria-controls="tf-chips-panel"
          onClick={() => setChipsOpen((o) => !o)}
          style={{ width: "100%", minHeight: 56, padding: "12px 18px", display: "flex", alignItems: "center",
            justifyContent: "space-between", gap: 12, border: "none", background: "none", cursor: "pointer",
            borderRadius: RADIUS.card, textAlign: "left", fontFamily: SANS }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: "1.05rem", fontWeight: 800, color: TEXT }}>{chipLabel}</span>
            {!chipsOpen && brief.chips.length > 0 && (
              <span style={{ display: "block", marginTop: 2, fontSize: "0.93rem", fontWeight: 600, color: TEXT_MUTED }}>
                {brief.chips.length} picked
              </span>
            )}
          </span>
          <span aria-hidden="true" style={{ display: "inline-flex", color: TEXT_MID, transform: chipsOpen ? "rotate(90deg)" : "none" }}>
            <PixelArrow size={16} />
          </span>
        </button>
        {chipsOpen && (
          <div id="tf-chips-panel" style={{ padding: "0 18px 18px" }}>
            <p style={{ margin: "0 0 14px", padding: "10px 12px", background: SURFACE, border: `1px solid ${BORDER}`,
              borderRadius: RADIUS.control, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.5 }}>
              Used for this search only. Talon doesn't save these or guess them.
            </p>
            {CHIP_GROUPS.map((g) => {
              const chips = CHIPS.filter((c) => c.group === g.key);
              if (!chips.length) return null;
              return (
                <div key={g.key} role="group" aria-labelledby={`tf-chips-${g.key}`} style={{ marginTop: 12 }}>
                  <p id={`tf-chips-${g.key}`} style={{ margin: "0 0 8px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT }}>
                    {g.label}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {chips.map((c) => {
                      const on = brief.chips.includes(c.key);
                      return (
                        <button key={c.key} type="button" className={FOCUS_CLASS} aria-pressed={on} onClick={() => toggleChip(c.key)}
                          style={{ minHeight: 44, maxWidth: "100%", padding: "8px 14px", display: "inline-flex", alignItems: "center",
                            gap: 8, borderRadius: RADIUS.pill, cursor: "pointer", fontFamily: SANS, fontSize: "0.95rem",
                            fontWeight: 700, textAlign: "left", lineHeight: 1.3,
                            border: `1.5px solid ${on ? ink.ring : BORDER}`, background: on ? ink.softer : WHITE,
                            color: on ? ink.onSoft : TEXT_MID }}>
                          <span aria-hidden="true" style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 5, boxSizing: "border-box",
                            border: `2px solid ${on ? ink.ring : "#8a857c"}`, background: on ? ink.button.bg : WHITE,
                            color: ink.button.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {on && <PixelStamp kind="check" size={8} />}
                          </span>
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {error && <Notice tone="error">{error}</Notice>}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <Button kind="primary" type="submit" style={{ minWidth: 180 }}>
          Check the details
          <PixelArrow size={16} />
        </Button>
        <span style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, fontWeight: 600 }}>
          Nothing is spent yet.
        </span>
      </div>
    </form>
  );
}
