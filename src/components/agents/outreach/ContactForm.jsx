import { useEffect, useId, useRef, useState } from "react";
import { PixelArrow, PixelStamp } from "../PixelIcons.jsx";
import {
  BORDER, DANGER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../agentUi.js";
import { STAGES, isEmail } from "../../../lib/outreach.js";
import { INPUT_CLASS } from "./BoardUi.js";
import { useIsMobile } from "../../../hooks/useIsMobile.js";

// The fields of a card the student adds or edits by hand, and the drawer's
// buttons. Everything here is the student's own tracking: nothing is sent to
// anyone. "Draft with Beaker" saves what was typed, then hands the name, the
// organization and any link in the notes to the outreach flow, which is where
// a try is spent. Beaker's draft goes on a new card; this one stays.
//
// A card Beaker made (`agent`) shows only what the student keeps for
// themselves (follow-up date and notes) and Delete. Its email, sources and
// sending live on the review page, which "Open the email" goes to.

const LIMITS = { name: 120, title: 160, organization: 160, email: 254, notes: 2000 };
const NOTES_WARN = 1800;
const URL_MAX = 2000;   // what the outreach flow accepts in ?url=

/** The first web link in a card's notes (a faculty or company page the
 *  student saved there), or "" when there is none. */
export function pageLinkIn(text) {
  const m = /https?:\/\/[^\s<>"'()[\]{}]+/i.exec(typeof text === "string" ? text : "");
  if (!m) return "";
  try {
    const u = new URL(m[0].replace(/[.,;:!?]+$/, ""));
    return (u.protocol === "https:" || u.protocol === "http:") && u.href.length <= URL_MAX ? u.href : "";
  } catch {
    return "";
  }
}

const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
};

export function formValues(card) {
  return {
    name: card?.name || "",
    title: card?.title || "",
    organization: card?.organization || "",
    email: card?.email || "",
    stage: card?.stage || "to_contact",
    follow_up_on: card?.follow_up_on || "",
    notes: card?.notes || "",
  };
}

const inputStyle = (invalid) => ({
  width: "100%", boxSizing: "border-box", minHeight: 46, padding: "11px 13px", fontFamily: SANS, fontSize: "1rem",
  color: TEXT, background: WHITE, border: `1.5px solid ${invalid ? DANGER : BORDER}`, borderRadius: RADIUS.control,
});

function Field({ id, label, hint, error, optional, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={id} style={{ display: "block", marginBottom: 6, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT }}>
        {label}
        {optional && <span style={{ fontWeight: 500, color: TEXT_MUTED }}> (optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "0.9rem", color: TEXT_MUTED, lineHeight: 1.45 }}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} style={{ margin: "6px 0 0", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700, color: DANGER }}>
          {error}
        </p>
      )}
    </div>
  );
}

const secondary = {
  minHeight: 44, padding: "0 16px", borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: WHITE,
  color: TEXT_MID, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, cursor: "pointer",
};

/**
 * `mode`: "add" or "edit". `onSubmit(values)` saves; the drawer shows `error`
 * if it fails. Edit mode adds Delete (with an inline confirm) and "Draft with
 * Beaker" (`canDraft` false greys it out and `draftNote` says why), which
 * checks the fields like Save and hands them to `onDraft(values)` to save
 * first. `agent`: the card was drafted by Beaker (see above); `onOpenEmail`
 * goes to its review page.
 */
export default function ContactForm({
  mode, initial, busy, error, confirming, canDraft = true, draftNote = null, agent = false,
  onSubmit, onCancel, onAskDelete, onConfirmDelete, onCancelDelete, onDraft, onOpenEmail, firstFieldRef,
}) {
  const ink = useAgentInk();
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const refs = { name: useRef(null), email: useRef(null) };
  const deleteRef = useRef(null);
  const narrow = useIsMobile(480);   // footer: Cancel and Save share the row; Delete moves up into the form
  const editing = mode === "edit";
  const disabled = !!busy;

  // Leaving the delete confirm (Keep it, or a delete that failed) puts focus
  // back on the Delete button that opened it.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (wasConfirming.current && !confirming) deleteRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const set = (key) => (e) => {
    const v = e.target.value;
    setValues((prev) => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: null }));
  };

  /** The values to save, or null (with the first problem focused). A card
   *  Beaker made shows no name or email field, so those are not checked. */
  const checked = () => {
    if (agent) return values;
    const next = {};
    if (!values.name.trim()) next.name = "Add a name.";
    if (values.email.trim() && !isEmail(values.email)) next.email = "That email address doesn't look right.";
    setErrors(next);
    const first = ["name", "email"].find((k) => next[k]);
    if (first) { refs[first].current?.focus(); return null; }
    return { ...values, name: values.name.trim(), email: values.email.trim() };
  };

  const submit = (e) => {
    e.preventDefault();
    if (disabled) return;
    const ready = checked();
    if (ready) onSubmit(ready);
  };

  const draft = () => {
    if (!canDraft || disabled) return;
    const ready = checked();
    if (ready) onDraft(ready);
  };

  const link = pageLinkIn(values.notes);

  const deleteButton = editing && (
    <button type="button" ref={deleteRef} className={FOCUS_CLASS} onClick={onAskDelete} disabled={disabled}
      style={{ ...secondary, color: DANGER, border: "1.5px solid #f1c4bf" }}>
      Delete{narrow ? " this contact" : ""}
    </button>
  );

  const described = (k, hint) => [errors[k] ? `${id(k)}-error` : hint ? `${id(k)}-hint` : null].filter(Boolean).join(" ") || undefined;

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px 8px" }}>
        {agent && (
          <div style={{ margin: "0 0 18px", padding: 14, borderRadius: RADIUS.control, background: WHITE,
            border: `1px solid ${BORDER}` }}>
            <p style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT, lineHeight: 1.5 }}>
              Beaker made this card. The email, its sources and sending are on the card's own page. Here you can keep
              notes, set a follow-up date, or delete the card.
            </p>
            <button type="button" className={FOCUS_CLASS} onClick={onOpenEmail} disabled={disabled}
              style={{ ...secondary, display: "inline-flex", alignItems: "center", gap: 8,
                cursor: disabled ? "default" : "pointer" }}>
              Open the email
              <PixelArrow size={16} />
            </button>
          </div>
        )}
        {!agent && (
          <>
            <Field id={id("name")} label="Name" error={errors.name}>
              <input id={id("name")} ref={(el) => { refs.name.current = el; if (firstFieldRef) firstFieldRef.current = el; }}
                className={INPUT_CLASS} value={values.name} onChange={set("name")} maxLength={LIMITS.name} autoComplete="off"
                required aria-required="true" aria-invalid={!!errors.name} aria-describedby={described("name")}
                placeholder="Dr. Maria Lee" style={inputStyle(!!errors.name)} />
            </Field>
            <Field id={id("title")} label="Title or role" optional>
              <input id={id("title")} className={INPUT_CLASS} value={values.title} onChange={set("title")} maxLength={LIMITS.title}
                autoComplete="off" placeholder="Professor of marine biology" style={inputStyle(false)} />
            </Field>
            <Field id={id("org")} label="School or company" optional>
              <input id={id("org")} className={INPUT_CLASS} value={values.organization} onChange={set("organization")}
                maxLength={LIMITS.organization} autoComplete="off" placeholder="University of South Florida" style={inputStyle(false)} />
            </Field>
            <Field id={id("email")} label="Email" optional error={errors.email}
              hint="Use an address from their own page, or one they gave you.">
              <input id={id("email")} ref={refs.email} className={INPUT_CLASS} type="email" inputMode="email" value={values.email}
                onChange={set("email")} maxLength={LIMITS.email} autoComplete="off" spellCheck={false}
                aria-invalid={!!errors.email} aria-describedby={described("email", true)} style={inputStyle(!!errors.email)} />
            </Field>
            <Field id={id("stage")} label="Stage">
              <select id={id("stage")} className={INPUT_CLASS} value={values.stage} onChange={set("stage")}
                style={{ ...inputStyle(false), cursor: "pointer" }}>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field id={id("date")} label="Follow-up date" optional hint="The card is marked in amber when this day comes.">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input id={id("date")} className={INPUT_CLASS} type="date" value={values.follow_up_on} onChange={set("follow_up_on")}
              aria-describedby={described("date", true)} style={{ ...inputStyle(false), flex: 1, minWidth: 0 }} />
            {values.follow_up_on && (
              <button type="button" className={FOCUS_CLASS} onClick={() => setValues((prev) => ({ ...prev, follow_up_on: "" }))}
                aria-label="Clear the follow-up date" style={{ ...secondary, flexShrink: 0 }}>
                Clear
              </button>
            )}
          </div>
        </Field>
        <Field id={id("notes")} label="Notes" optional
          hint={values.notes.length >= NOTES_WARN ? `${LIMITS.notes - values.notes.length} characters left.` : "Only you can see these."}>
          <textarea id={id("notes")} className={INPUT_CLASS} value={values.notes} onChange={set("notes")} maxLength={LIMITS.notes}
            rows={4} aria-describedby={described("notes", true)}
            style={{ ...inputStyle(false), minHeight: 104, resize: "vertical", lineHeight: 1.5 }} />
        </Field>

        {editing && !agent && (
          <div style={{ margin: "4px 0 12px", padding: "14px 14px 14px", borderRadius: RADIUS.control, background: ink.softer,
            border: `1px solid ${ink.soft}` }}>
            <p id={id("draft-how")} style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600,
              color: TEXT, lineHeight: 1.5 }}>
              Want Beaker to read up on {values.name.trim() || "them"} and draft an email? Your changes here are saved
              first. Beaker puts its draft on a new card, and this card stays as it is. It uses one of your tries.
              {link && ` It starts from the link in your notes (${hostOf(link) || "their page"}).`}
            </p>
            <button type="button" className={`${FOCUS_CLASS} ${PRESS_CLASS}`} aria-disabled={!canDraft || undefined}
              aria-describedby={!canDraft && draftNote ? id("draft-note") : id("draft-how")}
              onClick={draft}
              style={{ ...secondary, display: "inline-flex", alignItems: "center", gap: 8, border: `1.5px solid ${ink.soft}`,
                color: canDraft ? ink.onSoft : TEXT_MUTED, cursor: canDraft ? "pointer" : "not-allowed", opacity: canDraft ? 1 : 0.7 }}>
              <PixelStamp kind="letter" size={16} />
              {busy === "draft" ? "Saving..." : "Draft with Beaker"}
            </button>
            {!canDraft && draftNote && (
              <p id={id("draft-note")} style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, color: TEXT_MUTED }}>
                {draftNote}
              </p>
            )}
          </div>
        )}
        {narrow && editing && !confirming && <div style={{ margin: "4px 0 14px" }}>{deleteButton}</div>}
      </div>

      <div style={{ borderTop: `1px solid ${BORDER}`, background: WHITE, padding: "12px 20px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
        {error && (
          <p role="alert" style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: DANGER, lineHeight: 1.45 }}>
            {error}
          </p>
        )}
        {confirming ? (
          <div role="group" aria-labelledby={id("confirm")}>
            <p id={id("confirm")} style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT, lineHeight: 1.45 }}>
              Delete {initial.name || "this contact"} from your board?
              {agent ? " The email Beaker drafted and the sources it found go with it." : ""} This can't be undone.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" autoFocus className={FOCUS_CLASS} onClick={onCancelDelete} disabled={disabled}
                style={{ ...secondary, flex: "1 1 120px" }}>
                Keep it
              </button>
              <button type="button" className={`${FOCUS_CLASS} ${PRESS_CLASS}`} onClick={onConfirmDelete} disabled={disabled}
                style={{ ...secondary, flex: "1 1 120px", border: "none", background: DANGER, color: WHITE,
                  cursor: disabled ? "default" : "pointer" }}>
                {busy === "delete" ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {!narrow && deleteButton}
            {!narrow && <div style={{ flex: 1 }} />}
            <button type="button" className={FOCUS_CLASS} onClick={onCancel} disabled={disabled}
              style={{ ...secondary, flex: narrow ? "1 1 0" : "0 0 auto" }}>
              Cancel
            </button>
            <button type="submit" className={`${FOCUS_CLASS} ${PRESS_CLASS}`} disabled={disabled}
              style={{ ...secondary, flex: narrow ? "1.6 1 0" : "0 0 auto", border: "none", background: ink.button.bg,
                color: ink.button.fg, padding: "0 20px", cursor: disabled ? "default" : "pointer", whiteSpace: "nowrap" }}>
              {busy === "save" ? "Saving..." : editing ? "Save changes" : "Add contact"}
            </button>
          </div>
        )}
      </div>
    </form>
  );
}
