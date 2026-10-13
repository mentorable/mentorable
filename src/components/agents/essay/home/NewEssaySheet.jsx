import { useEffect, useId, useRef, useState } from "react";
import Sheet from "../../outreach/Sheet.jsx";
import { MascotSays } from "../../SpeechBubble.jsx";
import { PixelArrow } from "../../../ui/PixelIcons.jsx";
import {
  BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../../../ui/tokens.js";
import { Button, FieldLabel, INPUT_CLASS, Notice, inputStyle } from "../../../ui/kit.jsx";
import Spinner from "../../../common/Spinner.jsx";
import { QUILL_LINES } from "../../../../lib/agents/registry.js";
import { essayErrorMessage, needsSignIn } from "../../../../lib/agentsApi.js";
import {
  COMMON_APP_PROMPTS, KINDS, LIMIT_MAX, LIMIT_MIN, PROMPTS_NOTE, PS_MAX, PS_MIN,
} from "../../../../lib/essay.js";
import { CharCount, RadioRow, SheetHeader, SmallLabel } from "./homeParts.jsx";
import {
  PROMPT_MAX, PROMPT_MIN, QUILL, SCHOOL_MAX, SCHOOL_MIN, TITLE_MAX, budgetOf, refusalTone,
} from "./homeUi.js";

// A new essay. A personal statement picks one of the seven Common App
// prompts, or leaves that for later. A supplement names the school (from the
// student's College List, or typed), carries the prompt the student pastes in
// and the word limit that school sets. Nothing is looked up: the prompt and
// the limit are the student's to copy from the school.
//
// The backend creates the row (it holds the cap of 8 essays), so this sheet
// checks what it can first, in the server's own words, then asks. A refusal
// shows the server's message and leaves everything typed where it was.

const LATER = "later";       // the prompt choice that picks none yet
const OTHER = "other";       // the school choice that types a name
const KIND_HINTS = {
  personal_statement: `One essay for every Common App school, ${PS_MIN} to ${PS_MAX} words.`,
  supplement: "One school's own question, with the limit that school sets.",
};
const COMMON_LIMITS = [100, 150, 250, 400, 650];
const FIELD_OF = { bad_school: "school", bad_prompt: "prompt", bad_limit: "limit" };

const squeeze = (s) => String(s || "").replace(/\s+/g, " ").trim();

/**
 * userId: the signed-in student. topic: the idea this essay grows from, or
 * null. essays: the essays budget from status ({ left, limit }), or null.
 * loadSchools(userId): resolves to { items } (loadCollegeList).
 * onCreate(body): the backend call; resolves to { essay } or throws a refusal.
 * onCreated(essay): it exists; the page goes to it. onClose(). onSignIn().
 */
export default function NewEssaySheet({ userId, topic = null, essays = null, loadSchools, onCreate, onCreated, onClose, onSignIn }) {
  const ink = useAgentInk();
  const uid = useId();
  const id = (k) => `${uid}-${k}`;

  const [kind, setKind] = useState("personal_statement");
  const [promptKey, setPromptKey] = useState(LATER);
  const [schools, setSchools] = useState(null);       // null until asked for; then the list
  const [schoolsState, setSchoolsState] = useState("idle");   // idle | loading | ready | failed
  const [collegeId, setCollegeId] = useState("");     // "", a college_list_items id, or OTHER
  const [schoolName, setSchoolName] = useState("");
  const [promptText, setPromptText] = useState("");
  const [limit, setLimit] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);           // { message, tone, field, signIn, local }

  const alive = useRef(true);
  const asked = useRef(false);
  const schoolRef = useRef(null);
  const promptRef = useRef(null);
  const limitRef = useRef(null);
  const errorRef = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // The College List is only read once a supplement is on the table.
  useEffect(() => {
    if (kind !== "supplement" || asked.current) return;
    asked.current = true;
    setSchoolsState("loading");
    Promise.resolve()
      .then(() => loadSchools(userId))
      .then((res) => {
        if (!alive.current) return;
        const items = (Array.isArray(res?.items) ? res.items : []).filter((s) => s && s.id && typeof s.name === "string");
        setSchools(items);
        setSchoolsState("ready");
      })
      .catch((e) => {
        console.warn("[essay] college list failed:", e?.code || e?.name || "error");
        if (!alive.current) return;
        setSchools([]);
        setSchoolsState("failed");
      });
  }, [kind, loadSchools, userId]);

  const supplement = kind === "supplement";
  const hasList = Array.isArray(schools) && schools.length > 0;
  const typing = !hasList || collegeId === OTHER;     // the name is typed, not picked
  const budget = budgetOf(essays);
  const full = !!budget && budget.left <= 0;
  const picked = COMMON_APP_PROMPTS.find((p) => p.key === promptKey) || null;

  const focusField = (field) => {
    const el = field === "school" ? schoolRef.current : field === "prompt" ? promptRef.current
      : field === "limit" ? limitRef.current : errorRef.current;
    el?.focus?.();
  };
  const fail = (field, message) => {
    setError({ message, tone: "warn", field, signIn: false, local: true });
    focusField(field);
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy || full) return;
    const body = { kind };
    if (supplement) {
      const fromList = !typing && collegeId ? schools.find((s) => s.id === collegeId) || null : null;
      const typed = squeeze(schoolName);
      if (!fromList && (typed.length < SCHOOL_MIN || typed.length > SCHOOL_MAX)) {
        fail("school", "Pick the school this essay is for.");
        return;
      }
      const prompt = promptText.trim();
      if (prompt.length < PROMPT_MIN || prompt.length > PROMPT_MAX) {
        fail("prompt", `Paste the school's prompt, ${PROMPT_MIN} to ${PROMPT_MAX} characters.`);
        return;
      }
      const words = Number(limit);
      if (!/^\d+$/.test(limit) || words < LIMIT_MIN || words > LIMIT_MAX) {
        fail("limit", `Set the word limit, from ${LIMIT_MIN} to ${LIMIT_MAX}.`);
        return;
      }
      if (fromList) { body.college_id = fromList.id; body.school_name = fromList.name; } else body.school_name = typed;
      body.prompt_text = prompt;
      body.word_limit = words;
      const name = squeeze(title).slice(0, TITLE_MAX);
      if (name) body.title = name;
    } else if (picked) {
      // The row keeps the prompt's own words beside its number (the one copy
      // of the prompts lives in src/lib/essay.js).
      body.prompt_key = picked.key;
      body.prompt_text = picked.text;
    }
    if (topic?.id) body.topic_id = topic.id;

    setBusy(true); setError(null);
    try {
      const res = await onCreate(body);
      if (!alive.current) return;
      if (!res?.essay?.id) throw new Error("no essay came back");
      onCreated?.(res.essay);
    } catch (err) {
      if (!alive.current) return;
      const code = err?.code || "";
      setBusy(false);
      setError({ message: essayErrorMessage(err), tone: refusalTone(err), field: FIELD_OF[code] || null,
        signIn: needsSignIn(err), local: false });
    }
  };

  // After a refusal from the server the pressed button was disabled, which
  // drops focus: put it on the field the message is about, or on the message.
  // (A check made here has already moved focus itself.)
  useEffect(() => {
    if (!error || error.local) return;
    focusField(error.field);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const clear = (field) => { if (error?.field === field) setError(null); };
  const legend = { padding: 0, marginBottom: 8, fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: TEXT };
  const small = { margin: 0, fontFamily: SANS, fontSize: "0.92rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 };

  return (
    <Sheet onClose={onClose} locked={busy} labelledBy={id("title")} width={620}>
      <SheetHeader id={id("title")} title="New essay" onClose={onClose} closeOff={busy} />
      <MascotSays agent={QUILL} state="idle" size={64} layout="auto">{QUILL_LINES.newEssay}</MascotSays>

      <form onSubmit={submit} noValidate style={{ marginTop: 16 }}>
        {topic?.id && (
          <div style={{ marginBottom: 16, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control,
            padding: "10px 12px" }}>
            <SmallLabel stamp="sparkle">Growing from your idea</SmallLabel>
            <p style={{ margin: "4px 0 0", fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT, lineHeight: 1.45,
              overflowWrap: "anywhere" }}>
              {topic.area || "Untitled idea"}
            </p>
          </div>
        )}

        <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
          <legend style={legend}>What kind of essay?</legend>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))" }}>
            {KINDS.map((k, i) => (
              <RadioRow key={k.key} name={id("kind")} checked={kind === k.key} disabled={busy} autoFocusMark={i === 0}
                onChange={() => { setKind(k.key); setError(null); }} label={k.label} detail={KIND_HINTS[k.key]} />
            ))}
          </div>
        </fieldset>

        {!supplement ? (
          <fieldset style={{ border: "none", margin: "18px 0 0", padding: 0, minWidth: 0 }}>
            <legend style={legend}>Which prompt are you answering?</legend>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {COMMON_APP_PROMPTS.map((p) => (
                <RadioRow key={p.key} name={id("prompt")} checked={promptKey === p.key} disabled={busy}
                  onChange={() => setPromptKey(p.key)} label={`Prompt ${p.key}: ${p.short}`}>
                  <span style={{ display: "block", marginTop: 6, fontFamily: SANS, fontSize: "0.98rem", fontWeight: 500,
                    color: TEXT_MID, lineHeight: 1.55 }}>
                    {p.text}
                  </span>
                </RadioRow>
              ))}
              <RadioRow name={id("prompt")} checked={promptKey === LATER} disabled={busy}
                onChange={() => setPromptKey(LATER)} label="Decide later"
                detail="Start writing now and pick the prompt on the essay's page. Quill needs one before it can read a draft." />
            </div>
            <p style={{ ...small, marginTop: 10 }}>{PROMPTS_NOTE}</p>
          </fieldset>
        ) : (
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <FieldLabel htmlFor={hasList ? id("school") : id("school-name")}
                hint={schoolsState === "failed" ? "Your College List didn't load, so type the school's name."
                  : schoolsState === "ready" && !hasList ? "Your College List is empty, so type the school's name."
                  : null}>
                Which school is it for?
              </FieldLabel>
              {schoolsState === "loading" && (
                <p role="status" style={{ ...small, display: "flex", alignItems: "center", gap: 8, minHeight: 46, fontWeight: 600 }}>
                  <Spinner size={16} color={ink.text} /> Loading your College List...
                </p>
              )}
              {hasList && (
                <select ref={typing ? null : schoolRef} id={id("school")} className={INPUT_CLASS} value={collegeId}
                  disabled={busy} aria-invalid={error?.field === "school" && !typing ? true : undefined}
                  onChange={(e) => { setCollegeId(e.target.value); clear("school"); }}
                  style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">Pick from your College List</option>
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.state ? `${s.name}, ${s.state}` : s.name}</option>
                  ))}
                  <option value={OTHER}>Another school (type its name)</option>
                </select>
              )}
              {schoolsState !== "loading" && typing && (
                <div style={{ marginTop: hasList ? 10 : 0 }}>
                  {hasList && (
                    <label htmlFor={id("school-name")} style={{ display: "block", marginBottom: 6, fontFamily: SANS,
                      fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID }}>
                      The school&apos;s name
                    </label>
                  )}
                  <input ref={schoolRef} id={id("school-name")} type="text" className={INPUT_CLASS} value={schoolName}
                    maxLength={SCHOOL_MAX} autoComplete="off" disabled={busy}
                    aria-invalid={error?.field === "school" ? true : undefined}
                    onChange={(e) => { setSchoolName(e.target.value); clear("school"); }}
                    style={inputStyle} />
                </div>
              )}
            </div>

            <div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
                <FieldLabel htmlFor={id("prompt-text")} hint="Paste it exactly as the school wrote it. Quill doesn't look it up.">
                  The school&apos;s prompt
                </FieldLabel>
                <span style={{ marginBottom: 6 }}><CharCount n={promptText.length} max={PROMPT_MAX} /></span>
              </div>
              <textarea ref={promptRef} id={id("prompt-text")} className={INPUT_CLASS} value={promptText} rows={4}
                maxLength={PROMPT_MAX} disabled={busy} aria-invalid={error?.field === "prompt" ? true : undefined}
                onChange={(e) => { setPromptText(e.target.value); clear("prompt"); }}
                style={{ ...inputStyle, display: "block", minHeight: 112, resize: "vertical" }} />
            </div>

            <div>
              <FieldLabel htmlFor={id("limit")} hint={`The limit the school gives, from ${LIMIT_MIN} to ${LIMIT_MAX} words.`}>
                Word limit
              </FieldLabel>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <input ref={limitRef} id={id("limit")} type="text" inputMode="numeric" pattern="[0-9]*"
                  className={INPUT_CLASS} value={limit} disabled={busy} autoComplete="off"
                  aria-invalid={error?.field === "limit" ? true : undefined}
                  onChange={(e) => { setLimit(e.target.value.replace(/\D/g, "").slice(0, 4)); clear("limit"); }}
                  style={{ ...inputStyle, width: 112, fontVariantNumeric: "tabular-nums" }} />
                <div role="group" aria-label="Common limits" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {COMMON_LIMITS.map((n) => {
                    const on = limit === String(n);
                    return (
                      <button key={n} type="button" className={FOCUS_CLASS} aria-pressed={on} disabled={busy}
                        onClick={() => { setLimit(String(n)); clear("limit"); }}
                        style={{ minWidth: 52, minHeight: 44, padding: "0 10px", borderRadius: RADIUS.pill, cursor: "pointer",
                          fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, fontVariantNumeric: "tabular-nums",
                          border: `1.5px solid ${on ? ink.ring : BORDER}`, background: on ? ink.softer : WHITE,
                          color: on ? ink.onSoft : TEXT_MID }}>
                        {n}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <FieldLabel htmlFor={id("name")} optional hint="Handy when one school asks more than one question.">
                A name for this essay
              </FieldLabel>
              <input id={id("name")} type="text" className={INPUT_CLASS} value={title} maxLength={TITLE_MAX}
                autoComplete="off" disabled={busy} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
            </div>
          </div>
        )}

        <div ref={errorRef} tabIndex={-1} style={{ outline: "none" }}>
          {full && !error && (
            <Notice tone="warn" style={{ marginTop: 16 }}>
              You have {budget.limit} essays, the most Quill keeps. Open one and delete it to start another.
            </Notice>
          )}
          {error && (
            <Notice tone={error.tone} style={{ marginTop: 16 }}
              action={error.signIn ? <Button kind="secondary" onClick={() => onSignIn?.()}>Sign in again</Button> : null}>
              {error.message}
            </Notice>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
          <Button kind="primary" type="submit" busy={busy} disabled={full} style={{ flex: "1 1 180px" }}>
            {busy ? "Opening a blank page..." : "Start writing"}
            {!busy && <PixelArrow size={16} />}
          </Button>
          <Button kind="secondary" disabled={busy} onClick={() => onClose?.()} style={{ flex: "1 1 140px" }}>Cancel</Button>
        </div>
        {budget && !full && (
          <p style={{ ...small, marginTop: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {budget.left} of {budget.limit} essays left.
          </p>
        )}
      </form>
    </Sheet>
  );
}
