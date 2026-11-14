import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { POISE_LINES } from "../../../lib/agents/registry.js";
import Spinner from "../../common/Spinner.jsx";
import { PixelArrow, PixelStamp } from "../../ui/PixelIcons.jsx";
import { Button, FieldLabel, INPUT_CLASS, Notice, Sheet, inputStyle } from "../../ui/kit.jsx";
import { SANS, TEXT, TEXT_MID, TEXT_MUTED, useAgentInk } from "../../ui/tokens.js";
import { MascotSays } from "../SpeechBubble.jsx";
import { CharCount, RadioRow, SheetHeader } from "../essay/home/homeParts.jsx";
import { MicHelp } from "./CallStage.jsx";
import { PoiseLine } from "./MarshScene.jsx";
import { DETAILS_MAX, MODES, POISE, ROLE_MAX, TARGET_MAX } from "./interviewUi.js";

// Setting up one mock. A college interview names the school (from the
// student's College List, or typed); an internship names the organization,
// the role, and, if the student likes, the description they were given.
// Nothing is looked up: Poise knows the student's record and what is typed
// here, nothing else.
//
// The page owns the call (it checks the microphone, then asks the backend,
// which spends the mock), so this sheet only checks what it can first and
// shows the page's answer. A refusal leaves everything typed where it was.

const OTHER = "other";       // the school choice that types a name
const FIELD_OF = { bad_target: "target", bad_role: "role", bad_details: "details" };

const squeeze = (s) => String(s || "").replace(/\s+/g, " ").trim();

/** The page's `error` prop, as a string or an object, made one shape. */
function errorOf(raw) {
  if (!raw) return null;
  if (typeof raw === "string") return { message: raw, tone: "warn", field: null, signIn: false, mic: null };
  return {
    message: raw.message || "",
    tone: raw.tone || "warn",
    field: raw.field || FIELD_OF[raw.code] || null,
    signIn: !!raw.signIn,
    mic: raw.mic || null,
    action: raw.action || null,
  };
}

/**
 * open: show the sheet. onClose(). onStart(body): resolves when the call is
 * on its way (the page navigates), or rejects (the page sets `error`).
 * body: { mode, target, role, details }. colleges: [{ id, name }] from the
 * College List, or null while it loads. busy: the start is in flight.
 * error: null, a message, or { message, tone, field, signIn, mic, action }
 * (`mic`: "denied" | "missing" | "unsupported", for the microphone help).
 */
export default function SetupSheet({ open, onClose, onStart, colleges = null, busy = false, error = null }) {
  const ink = useAgentInk();
  const uid = useId();
  const id = (k) => `${uid}-${k}`;

  const [mode, setMode] = useState("college");
  const [collegeId, setCollegeId] = useState("");     // "", a college_list_items id, or OTHER
  const [school, setSchool] = useState("");
  const [org, setOrg] = useState("");
  const [role, setRole] = useState("");
  const [details, setDetails] = useState("");
  const [local, setLocal] = useState(null);           // { message, field }: this sheet's own check

  const targetRef = useRef(null);
  const roleRef = useRef(null);
  const detailsRef = useRef(null);
  const errorRef = useRef(null);

  const shown = local || errorOf(error);
  const loading = colleges === null;
  const list = Array.isArray(colleges) ? colleges.filter((c) => c && c.id && typeof c.name === "string" && c.name.trim()) : [];
  const hasList = list.length > 0;
  const typing = !hasList || collegeId === OTHER;
  const college = mode === "college";

  const focusField = (field) => {
    const el = field === "target" ? targetRef.current : field === "role" ? roleRef.current
      : field === "details" ? detailsRef.current : errorRef.current;
    el?.focus?.();
  };

  // A refusal from the page arrives after the pressed button went busy, which
  // drops focus: put it on the field the message is about, or on the message.
  useEffect(() => {
    if (!open || !error) return;
    focusField(errorOf(error)?.field);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, open]);

  const fail = (field, message) => {
    setLocal({ message, tone: "warn", field, signIn: false, mic: null });
    // After the render that shows the message, so a field that only appears with it can take focus.
    setTimeout(() => focusField(field), 0);
  };
  const clear = (field) => { if (local?.field === field) setLocal(null); };

  const submit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;
    setLocal(null);
    let target = "";
    let roleText = null;
    let detailText = null;
    if (college) {
      const picked = !typing && collegeId ? list.find((c) => c.id === collegeId) || null : null;
      target = picked ? squeeze(picked.name).slice(0, TARGET_MAX) : squeeze(school);
      if (!target) { fail("target", hasList && !typing ? "Pick the school you're practicing for." : "Type the school's name."); return; }
    } else {
      target = squeeze(org);
      if (!target) { fail("target", "Type the organization's name."); return; }
      roleText = squeeze(role);
      if (!roleText) { fail("role", "Type the role you're interviewing for."); return; }
      detailText = details.trim();
    }
    if (target.length > TARGET_MAX) { fail("target", `Keep the name under ${TARGET_MAX} characters.`); return; }
    if (roleText && roleText.length > ROLE_MAX) { fail("role", `Keep the role under ${ROLE_MAX} characters.`); return; }
    try {
      await onStart?.({ mode, target, role: roleText, details: detailText || null });
    } catch { /* the page shows its own error */ }
  };

  const small = { margin: 0, fontFamily: SANS, fontSize: "0.92rem", fontWeight: 500, color: TEXT_MUTED, lineHeight: 1.5 };
  const legend = { padding: 0, marginBottom: 8, fontFamily: SANS, fontSize: "1rem", fontWeight: 800, color: TEXT };
  const invalid = (field) => (shown?.field === field ? true : undefined);

  return (
    <AnimatePresence>
      {open && (
        <Sheet key="setup" onClose={onClose} locked={busy} labelledBy={id("title")} width={600}>
          <SheetHeader id={id("title")} title="Set up a mock interview" onClose={onClose} closeOff={busy} />
          <MascotSays agent={POISE} state="idle" size={64} layout="auto">{POISE_LINES?.setupAsk}</MascotSays>

          <form onSubmit={submit} noValidate style={{ marginTop: 16 }}>
            <fieldset style={{ border: "none", margin: 0, padding: 0, minWidth: 0 }}>
              <legend style={legend}>What kind of interview?</legend>
              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))" }}>
                {MODES.map((m, i) => (
                  <RadioRow key={m.key} name={id("mode")} checked={mode === m.key} disabled={busy} autoFocusMark={i === 0}
                    onChange={() => { setMode(m.key); setLocal(null); }} label={m.label} detail={m.detail} />
                ))}
              </div>
            </fieldset>

            {college ? (
              <div style={{ marginTop: 18 }}>
                <PoiseLine style={{ marginBottom: 10 }}>{POISE_LINES?.collegeAsk}</PoiseLine>
                <FieldLabel htmlFor={hasList ? id("college") : id("school")}
                  hint={!loading && !hasList ? "Your College List is empty, so type the school's name." : null}>
                  Which school?
                </FieldLabel>
                {loading && (
                  <p role="status" style={{ ...small, display: "flex", alignItems: "center", gap: 8, minHeight: 46, fontWeight: 600 }}>
                    <Spinner size={16} color={ink.text} /> Loading your College List...
                  </p>
                )}
                {!loading && hasList && (
                  <select ref={typing ? null : targetRef} id={id("college")} className={INPUT_CLASS} value={collegeId}
                    disabled={busy} aria-invalid={!typing ? invalid("target") : undefined}
                    onChange={(e) => { setCollegeId(e.target.value); clear("target"); }}
                    style={{ ...inputStyle, cursor: "pointer" }}>
                    <option value="">Pick from your College List</option>
                    {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value={OTHER}>Type a school</option>
                  </select>
                )}
                {!loading && typing && (
                  <div style={{ marginTop: hasList ? 10 : 0 }}>
                    {hasList && (
                      <label htmlFor={id("school")} style={{ display: "block", marginBottom: 6, fontFamily: SANS,
                        fontSize: "0.95rem", fontWeight: 700, color: TEXT_MID }}>
                        The school&apos;s name
                      </label>
                    )}
                    <input ref={targetRef} id={id("school")} type="text" className={INPUT_CLASS} value={school}
                      maxLength={TARGET_MAX} autoComplete="off" disabled={busy} aria-invalid={invalid("target")}
                      onChange={(e) => { setSchool(e.target.value); clear("target"); }} style={inputStyle} />
                  </div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 16 }}>
                <PoiseLine>{POISE_LINES?.internshipAsk}</PoiseLine>
                <div>
                  <FieldLabel htmlFor={id("org")}>The organization</FieldLabel>
                  <input ref={targetRef} id={id("org")} type="text" className={INPUT_CLASS} value={org} maxLength={TARGET_MAX}
                    autoComplete="off" disabled={busy} aria-invalid={invalid("target")}
                    onChange={(e) => { setOrg(e.target.value); clear("target"); }} style={inputStyle} />
                </div>
                <div>
                  <FieldLabel htmlFor={id("role")} hint="An internship, a summer program, a part-time job.">The role</FieldLabel>
                  <input ref={roleRef} id={id("role")} type="text" className={INPUT_CLASS} value={role} maxLength={ROLE_MAX}
                    autoComplete="off" disabled={busy} aria-invalid={invalid("role")}
                    onChange={(e) => { setRole(e.target.value); clear("role"); }} style={inputStyle} />
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
                    <FieldLabel htmlFor={id("details")} optional
                      hint="Paste the description you were given, if you have one. Poise doesn't look anything up.">
                      About the role
                    </FieldLabel>
                    <span style={{ marginBottom: 6 }}><CharCount id={id("count")} n={details.length} max={DETAILS_MAX} /></span>
                  </div>
                  <textarea ref={detailsRef} id={id("details")} className={INPUT_CLASS} value={details} rows={5}
                    maxLength={DETAILS_MAX} disabled={busy} aria-invalid={invalid("details")} aria-describedby={id("count")}
                    onChange={(e) => { setDetails(e.target.value); clear("details"); }}
                    style={{ ...inputStyle, display: "block", minHeight: 120, resize: "vertical" }} />
                </div>
              </div>
            )}

            <p style={{ ...small, marginTop: 16, display: "flex", alignItems: "flex-start", gap: 8, fontWeight: 600, color: TEXT_MID }}>
              <span aria-hidden="true" style={{ display: "flex", marginTop: 3, flexShrink: 0, color: ink.text }}>
                <PixelStamp kind="clock" size={16} />
              </span>
              <span>
                Up to 10 minutes, by voice. Your browser will ask for the microphone first. Starting uses one of your mocks.
              </span>
            </p>

            <div ref={errorRef} tabIndex={-1} style={{ outline: "none" }}>
              {shown?.message && (
                <Notice tone={shown.tone === "error" ? "error" : "warn"} style={{ marginTop: 16 }}
                  action={shown.signIn ? shown.action : shown.mic ? <MicHelp reason={shown.mic} /> : shown.action}>
                  {shown.message}
                </Notice>
              )}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18 }}>
              <Button kind="primary" type="submit" busy={busy} style={{ flex: "1 1 200px" }}>
                {busy ? "Getting Poise ready..." : "Start the interview"}
                {!busy && <PixelArrow size={16} />}
              </Button>
              <Button kind="secondary" disabled={busy} onClick={() => onClose?.()} style={{ flex: "1 1 140px" }}>Cancel</Button>
            </div>
          </form>
        </Sheet>
      )}
    </AnimatePresence>
  );
}
