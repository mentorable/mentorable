import { useState } from "react";
import { PixelArrow, PixelStamp } from "../PixelIcons.jsx";
import {
  AMBER_BG, AMBER_TEXT, BORDER, DANGER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../agentUi.js";
import {
  Button, CHOICE_CLASS, Counter, FieldLabel, INPUT_CLASS, Notice, SR_ONLY, inputStyle,
} from "./flowUi.jsx";
import {
  BLOCK_COPY, EXAMPLE_GOALS, GOAL_MAX, GOAL_MIN, GOAL_RUNS, NAME_MAX, ORG_MAX, URL_MAX, researchBlock,
} from "./options.js";

// Step 1: who the letter is for. A person the student has in mind (name,
// school or company, an optional link), or a goal Beaker turns into a
// shortlist of real people. Says what it costs before anything is spent, and
// stops here when no tries are left.

const MODES = [
  { key: "person", label: "Someone I have in mind", hint: "A professor, scientist or professional you already know of." },
  { key: "goal", label: "A goal", hint: "Tell Beaker what you're after, and it finds a few real people to pick from." },
];

function ModeChoice({ mode, onMode }) {
  const ink = useAgentInk();
  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
      <legend style={SR_ONLY}>Who is this for?</legend>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        {MODES.map((m) => {
          const on = mode === m.key;
          return (
            <label key={m.key} className={CHOICE_CLASS}
              style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", borderRadius: RADIUS.card,
                padding: "14px 16px", background: on ? ink.softer : WHITE, boxSizing: "border-box", minHeight: 44,
                border: `2px solid ${on ? ink.ring : BORDER}` }}>
              <input type="radio" name="oa-mode" value={m.key} checked={on} onChange={() => onMode(m.key)}
                style={{ ...SR_ONLY }} />
              <span aria-hidden="true" style={{ flexShrink: 0, width: 20, height: 20, marginTop: 3, borderRadius: 99,
                border: `2px solid ${on ? ink.ring : "#8a857c"}`, background: WHITE, display: "flex", alignItems: "center",
                justifyContent: "center", boxSizing: "border-box" }}>
                {on && <span style={{ width: 10, height: 10, borderRadius: 99, background: ink.button.bg }} />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: SANS, fontWeight: 800, fontSize: "1.05rem", color: TEXT }}>{m.label}</span>
                <span style={{ display: "block", marginTop: 3, fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, lineHeight: 1.5 }}>
                  {m.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The cost line, or the stop when nothing is left to start with. `block`:
 *  researchBlock's reason ("tries" or "searches"), or null. */
function Tries({ tries, block, onBoard }) {
  if (block) {
    return (
      <div role="status" style={{ background: AMBER_BG, border: "1px solid #f3d9a4", borderRadius: RADIUS.control,
        padding: "12px 14px", fontFamily: SANS, color: AMBER_TEXT, lineHeight: 1.55 }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: "1rem" }}>{BLOCK_COPY[block].title}</p>
        <p style={{ margin: "4px 0 10px", fontWeight: 600, fontSize: "0.98rem" }}>{BLOCK_COPY[block].line}</p>
        {onBoard && <Button kind="secondary" onClick={onBoard}>Back to your board</Button>}
      </div>
    );
  }
  if (!tries) return null;
  return (
    <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: "0.98rem",
      fontWeight: 600, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
      <PixelStamp kind="letter" size={16} />
      Uses 1 of your {tries.limit} tries ({tries.left} left).
    </p>
  );
}

/** tries, searches: the counts from status, or null when unknown. */
export default function WhoStep({
  mode, onMode, person, onPerson, goal, onGoal, tries, searches, busy, error, onContinue, onBoard,
}) {
  const ink = useAgentInk();
  const [tried, setTried] = useState(false);   // show field errors only after a first attempt
  const block = researchBlock({ tries, searches });
  const blocked = !!block;
  // A goal takes two runs (find people, then read up on the pick). With one
  // left, the shortlist would work and the pick would be refused.
  const goalShort = !blocked && mode === "goal" && !!researchBlock({ tries, searches }, { runs: GOAL_RUNS });

  const name = person.name.trim();
  const goalLen = goal.trim().length;
  const problem = mode === "person"
    ? (name.length < 2 ? "Add their name." : null)
    : (goalLen < GOAL_MIN ? `Describe your goal in at least ${GOAL_MIN} characters.`
      : goalLen > GOAL_MAX ? `Keep your goal under ${GOAL_MAX} characters.` : null);

  const submit = (e) => {
    e.preventDefault();
    setTried(true);
    if (problem || blocked || goalShort || busy) return;
    onContinue();
  };

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <ModeChoice mode={mode} onMode={onMode} />

      {mode === "person" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <FieldLabel htmlFor="oa-name">Their name</FieldLabel>
            <input id="oa-name" className={INPUT_CLASS} value={person.name} maxLength={NAME_MAX} autoComplete="off"
              aria-invalid={tried && !!problem} aria-describedby={tried && problem ? "oa-who-error" : undefined}
              onChange={(e) => onPerson({ name: e.target.value })} placeholder="Dr. Maria Lee" style={inputStyle} />
          </div>
          <div>
            <FieldLabel htmlFor="oa-org" optional>School or company</FieldLabel>
            <input id="oa-org" className={INPUT_CLASS} value={person.organization} maxLength={ORG_MAX} autoComplete="off"
              onChange={(e) => onPerson({ organization: e.target.value })} placeholder="University of South Florida"
              style={inputStyle} />
          </div>
          <div>
            <FieldLabel htmlFor="oa-url" optional hint="Their faculty or company page helps Beaker find the right person.">
              A page about them
            </FieldLabel>
            <input id="oa-url" className={INPUT_CLASS} type="url" inputMode="url" value={person.url} maxLength={URL_MAX}
              autoComplete="off" onChange={(e) => onPerson({ url: e.target.value })} placeholder="https://"
              style={inputStyle} />
          </div>
        </div>
      ) : (
        <div>
          <FieldLabel htmlFor="oa-goal" hint="Who would you like to hear from, and about what? Mention where, if it matters.">
            Your goal
          </FieldLabel>
          <textarea id="oa-goal" className={INPUT_CLASS} value={goal} maxLength={GOAL_MAX} rows={3}
            aria-invalid={tried && !!problem} aria-describedby={`oa-goal-count${tried && problem ? " oa-who-error" : ""}`}
            onChange={(e) => onGoal(e.target.value)}
            placeholder="A professor near Tampa who studies coral reefs"
            style={{ ...inputStyle, resize: "vertical", minHeight: 96 }} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <Counter id="oa-goal-count" n={goal.length} max={GOAL_MAX} />
          </div>
          <p style={{ margin: "6px 0 8px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID }}>
            Or start from an example:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {EXAMPLE_GOALS.map((g) => (
              <button key={g} type="button" className={FOCUS_CLASS} onClick={() => onGoal(g)}
                style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT, textAlign: "left",
                  background: goal === g ? ink.soft : WHITE, border: `1.5px solid ${goal === g ? ink.ring : BORDER}`,
                  borderRadius: RADIUS.control, padding: "9px 12px", minHeight: 44, cursor: "pointer", lineHeight: 1.4,
                  maxWidth: "100%" }}>
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      <Tries tries={tries} block={block} onBoard={onBoard} />
      {goalShort && (
        <Notice tone="warn">
          Beaker has one research run left, and a goal takes two: one to find people and one to read up on the
          person you pick. Name someone you have in mind instead, and one run is enough.
        </Notice>
      )}

      {tried && problem && <p id="oa-who-error" role="alert" style={{ margin: 0, fontFamily: SANS, fontWeight: 700,
        fontSize: "0.98rem", color: DANGER }}>{problem}</p>}
      {error && <Notice tone="error">{error}</Notice>}

      {!blocked && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <Button kind="primary" type="submit" busy={busy} disabled={goalShort} style={{ minWidth: 180 }}>
            {mode === "goal" ? "Find people" : "Continue"}
            {!busy && <PixelArrow size={16} />}
          </Button>
          {mode === "goal" && (
            <span style={{ fontFamily: SANS, fontSize: "0.95rem", color: TEXT_MUTED, fontWeight: 600 }}>
              This starts your try.
            </span>
          )}
        </div>
      )}
    </form>
  );
}
