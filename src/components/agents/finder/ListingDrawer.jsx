import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PixelStamp } from "../PixelIcons.jsx";
import {
  AMBER_BG, AMBER_TEXT, BG, BORDER, DANGER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_MID, TEXT_MUTED,
  WHITE, ringVar, useAgentInk,
} from "../agentUi.js";
import { CHOICE_CLASS, Counter, INPUT_CLASS, SR_ONLY, SourceLink, domainOf, inputStyle } from "../outreach/flowUi.jsx";
import { DRAWER_Z } from "../outreach/BoardUi.js";
import Spinner from "../../common/Spinner.jsx";
import { TALON_LINES } from "../../../lib/agents/registry.js";
import {
  RECHECKS_PER_ITEM, STATUSES, deadlineLabel, isSoon, isStale, moneyLine, outcomeLabel, rechecksLeft,
} from "../../../lib/finder.js";
import { useIsMobile } from "../../../hooks/useIsMobile.js";
import { KindTag, TrustBadge } from "./ListingCard.jsx";
import { checkedLabel, listOf, plural } from "./finderUi.js";

// The side drawer for one find: every fact Talon read, with its label, the
// links to the page, who it is for and what the student would need to
// confirm, the requirement checklist, their notes, where it stands, and
// Recheck, Dismiss and Delete. A modal dialog like Beaker's contact drawer:
// focus moves to the heading, Tab stays inside, Escape closes (or first backs
// out of a delete confirm), and closing hands focus back to whatever opened
// it, or to `onFallbackFocus` when that is gone (the card was just dismissed).
//
// Every change goes up through `onChange(patch)`, which the board saves
// optimistically (and rolls back, with a message, if the save fails). Notes
// save when the box loses focus, and when the drawer closes; a notes save
// that fails leaves the text in the box and tries again on the next blur.
//
// Mount it to open it (inside AnimatePresence for the slide out).

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), " +
  "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
const NOTES_MAX = 2000;
const ESSAY_RE = /\b(essay|personal statement|statement of purpose|short answer|writing sample)\b/i;

const secondary = {
  minHeight: 44, padding: "0 16px", borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`, background: WHITE,
  color: TEXT_MID, fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, cursor: "pointer", lineHeight: 1.25,
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, boxSizing: "border-box",
};

function Section({ title, id, children, aside }) {
  return (
    <section aria-labelledby={id} style={{ marginTop: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <h3 id={id} style={{ margin: 0, fontFamily: SANS, fontSize: "1.05rem", fontWeight: 800, color: TEXT }}>{title}</h3>
        {aside}
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </section>
  );
}

/** A list of short lines, each with `icon`, or a plain neutral bullet when
 *  no icon is given (who it's for: a check there would read as "you meet
 *  this", and Talon never compared those lines with the student). */
function Lines({ items, icon }) {
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {items.map((text, i) => (
        <li key={`${i}-${text}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: SANS,
          fontSize: "0.98rem", fontWeight: 600, color: TEXT_MID, lineHeight: 1.5, overflowWrap: "anywhere" }}>
          {icon ? (
            <span aria-hidden="true" style={{ display: "flex", marginTop: 3, flexShrink: 0 }}><PixelStamp kind={icon} size={16} /></span>
          ) : (
            <span aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16,
              height: 16, marginTop: 3, flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, background: TEXT_MUTED }} />
            </span>
          )}
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * item: a finder_items row. onChange(patch): saves fields the student owns
 * (status, outcome, notes, req_done), and may return a promise of whether it
 * saved. draftNotes: notes typed earlier whose save failed, shown in the box
 * in place of item.notes so they are saved again. onRecheck(item): resolves to
 * { changed: [...], gone } or throws an Error whose message is fit to show.
 * onDelete(item): async, throws a message fit to show. rechecking: a recheck
 * of this item is in flight. recheckBudget: { left, limit } from status, or
 * null when unknown.
 */
export default function ListingDrawer({
  item, today = new Date(), onClose, onChange, onRecheck, onDelete, rechecking = false, recheckBudget = null,
  onFallbackFocus, draftNotes,
}) {
  const ink = useAgentInk();
  const isMobile = useIsMobile();
  const reduce = useReducedMotion();
  const uid = useId();
  const id = (k) => `${uid}-${k}`;
  const panelRef = useRef(null);
  const titleRef = useRef(null);
  const [notes, setNotes] = useState(() => (typeof draftNotes === "string" ? draftNotes : item.notes || ""));
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [recheck, setRecheck] = useState(null);          // { changed, gone } after a recheck
  const [recheckError, setRecheckError] = useState(null);
  const recheckRef = useRef(null);

  // Recheck is the last section, so its answer lands below the fold: bring
  // it into view once it is in.
  useEffect(() => {
    if (!recheck && !recheckError) return;
    try {
      recheckRef.current?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    } catch { /* old browsers: the answer is still there to scroll to */ }
  }, [recheck, recheckError, reduce]);

  // Notes are saved from the latest text, whichever way the drawer closes.
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const savedNotes = useRef(item.notes || "");    // the text last sent
  const storedNotes = useRef(item.notes || "");   // the text the database last took
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const flushNotes = () => {
    const now = notesRef.current;
    if (now === savedNotes.current) return;
    savedNotes.current = now;
    // The board saves one card's changes in order, so these answers arrive
    // in the order they were sent.
    Promise.resolve(changeRef.current?.({ notes: now })).then((ok) => {
      if (ok === true) storedNotes.current = now;
      // Not saved: the next blur (or closing) sends it again, unless a later
      // flush has moved on already.
      else if (ok === false && savedNotes.current === now) savedNotes.current = storedNotes.current;
    });
  };

  const fallback = useRef(onFallbackFocus);
  fallback.current = onFallbackFocus;
  useEffect(() => {
    const opener = document.activeElement;
    titleRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      if (opener && opener !== document.body && document.contains(opener)) opener.focus();
      else fallback.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (deleting) return;
    flushNotes();
    onClose();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (deleting) return;
      if (confirming) setConfirming(false);
      else close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const trapTab = (e) => {
    if (e.key !== "Tab" || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const inside = panelRef.current.contains(document.activeElement);
    if (e.shiftKey && (document.activeElement === first || !inside || document.activeElement === titleRef.current)) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
      e.preventDefault(); first.focus();
    }
  };

  // ── Facts ──────────────────────────────────────────────────────────────────

  const scholarship = item.lane === "scholarship";
  const soon = isSoon(item, today);
  const stale = isStale(item, today);
  const money = moneyLine(item);
  const eligibility = listOf(item.eligibility);
  const confirm = listOf(item.confirm);
  const requirements = listOf(item.requirements);
  const done = new Set((Array.isArray(item.req_done) ? item.req_done : []).filter(Number.isInteger));
  const doneCount = requirements.filter((_, i) => done.has(i)).length;
  const sourceDiffers = item.source_url && item.source_url !== item.url;
  const essay = requirements.some((r) => ESSAY_RE.test(r));
  const deadlineSays = item.deadline_text && item.deadline_kind !== "date" ? item.deadline_text : "";

  const facts = [
    { label: "Offered by", value: item.provider },
    { label: "Deadline", value: deadlineLabel(item, today), amber: soon },
    deadlineSays ? { label: "Its page says", value: deadlineSays } : null,
    { label: scholarship ? "Amount" : "Cost", value: money || "Not listed on its page" },
    { label: "When", value: item.dates_text },
    { label: "Where", value: item.location_text },
  ].filter((f) => f && f.value);

  // ── Changes ────────────────────────────────────────────────────────────────

  const toggleReq = (i) => {
    const next = new Set(done);
    if (next.has(i)) next.delete(i); else next.add(i);
    onChange({ req_done: [...next].filter((n) => n < requirements.length).sort((a, b) => a - b) });
  };

  const statusOptions = item.status === "dismissed"
    ? [...STATUSES, { key: "dismissed", label: "Dismissed" }]
    : STATUSES;

  const perItem = rechecksLeft(item);
  const budgetLeft = Number.isFinite(recheckBudget?.left) ? recheckBudget.left : null;
  const recheckStop = perItem <= 0
    ? `You've rechecked this one ${RECHECKS_PER_ITEM} times. Open its page to check it yourself.`
    : budgetLeft !== null && budgetLeft <= 0
      ? "You've used all the rechecks this demo allows. Open its page to check it yourself."
      : null;

  const runRecheck = async () => {
    if (rechecking || recheckStop) return;
    setRecheck(null); setRecheckError(null);
    try {
      const res = await onRecheck(item);
      setRecheck({ changed: listOf(res?.changed), gone: !!res?.gone });
    } catch (e) {
      setRecheckError(e?.message || "Talon couldn't read that page just now. Try again later.");
    }
  };

  const remove = async () => {
    setDeleting(true); setError(null);
    try {
      await onDelete(item);
    } catch (e) {
      setError(e?.message || "Couldn't delete that. Try again.");
      setConfirming(false);
      setDeleting(false);
    }
  };

  const dismissOrRestore = () => {
    if (item.status === "dismissed") {
      onChange({ status: "saved" });
    } else {
      flushNotes();
      onChange({ status: "dismissed" });
      onClose();
    }
  };

  const slide = reduce ? { opacity: 0 } : { x: isMobile ? 0 : 48, y: isMobile ? 32 : 0, opacity: 0 };
  const text = { fontFamily: SANS, fontSize: "1rem", color: TEXT, lineHeight: 1.55, margin: 0, overflowWrap: "anywhere" };

  return (
    <div style={{ ...ringVar(ink), position: "fixed", inset: 0, zIndex: DRAWER_Z }}>
      <motion.div aria-hidden="true" onClick={close}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0.01 : 0.18 }}
        style={{ position: "absolute", inset: 0, background: "rgba(20,20,19,0.42)" }} />
      <motion.div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={id("title")} onKeyDown={trapTab}
        initial={slide} animate={{ x: 0, y: 0, opacity: 1 }} exit={slide}
        transition={{ duration: reduce ? 0.01 : 0.26, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: isMobile ? "100%" : 520, maxWidth: "100%",
          background: BG, boxShadow: "-12px 0 40px rgba(20,20,19,0.18)", display: "flex", flexDirection: "column",
          boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 12px 12px 20px", background: WHITE,
          borderBottom: `1px solid ${BORDER}`, paddingTop: "calc(12px + env(safe-area-inset-top, 0px))" }}>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            <KindTag kind={item.kind} />
            <h2 id={id("title")} ref={titleRef} tabIndex={-1}
              style={{ margin: "8px 0 0", fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
                letterSpacing: "-0.01em", lineHeight: 1.25, outline: "none", overflowWrap: "anywhere" }}>
              {item.title}
            </h2>
          </div>
          <button type="button" className={FOCUS_CLASS} onClick={close} aria-label="Close"
            style={{ flexShrink: 0, width: 44, height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center",
              border: "none", borderRadius: 10, background: "rgba(20,20,19,0.05)", color: TEXT_MID, cursor: "pointer" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
              strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
          {/* Trust and freshness first: where the facts came from, and when. */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 12px" }}>
            <TrustBadge verified={!!item.verified} />
            <span style={{ fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: TEXT_MUTED }}>
              {checkedLabel(item, today) || "Not checked yet"}
            </span>
          </div>
          {!item.verified && (
            <p style={{ ...text, marginTop: 8, fontSize: "0.95rem", color: TEXT_MID }}>
              Talon read these details on a page that isn't the provider's own, so check the deadline and the rules
              with the provider before you apply.
            </p>
          )}
          {(stale || item.recheck_note) && (
            <div role="status" style={{ marginTop: 12, background: AMBER_BG, border: "1px solid #f3d9a4",
              borderRadius: RADIUS.control, padding: "10px 12px", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700,
              color: AMBER_TEXT, lineHeight: 1.5, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span aria-hidden="true" style={{ display: "flex", marginTop: 3 }}><PixelStamp kind="clock" size={16} /></span>
              <span>
                {item.recheck_note || TALON_LINES.staleNote}
                {item.recheck_note && stale && <span style={{ display: "block", marginTop: 4 }}>{TALON_LINES.staleNote}</span>}
              </span>
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px", marginTop: 10 }}>
            <SourceLink url={item.url}>Open its page</SourceLink>
            {sourceDiffers && (
              <SourceLink url={item.source_url}>Where Talon read the details ({domainOf(item.source_url) || "page"})</SourceLink>
            )}
          </div>

          <dl style={{ margin: "12px 0 0", background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control,
            padding: "4px 14px" }}>
            {facts.map((f, i) => (
              <div key={f.label} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "128px minmax(0, 1fr)",
                gap: isMobile ? 2 : 12, padding: "10px 0", borderTop: i ? `1px solid ${BORDER}` : "none" }}>
                <dt style={{ fontFamily: SANS, fontSize: "0.92rem", fontWeight: 700, color: TEXT_MUTED }}>{f.label}</dt>
                <dd style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, lineHeight: 1.5,
                  color: f.amber ? AMBER_TEXT : TEXT, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>

          {item.summary && (
            <Section title="What it is" id={id("summary")}>
              <p style={text}>{item.summary}</p>
            </Section>
          )}
          {item.fit_reason && (
            <Section title="Why it fits you" id={id("fit")}>
              <p style={text}>{item.fit_reason}</p>
            </Section>
          )}
          {eligibility.length > 0 && (
            <Section title="Who it's for" id={id("elig")}>
              <Lines items={eligibility} />
            </Section>
          )}
          {confirm.length > 0 && (
            <Section title="You'd need to confirm" id={id("confirm")}>
              <p style={{ ...text, fontSize: "0.95rem", color: TEXT_MID, marginBottom: 8 }}>
                Its page asks for these. Talon didn't assume them about you.
              </p>
              <Lines items={confirm} icon="question" />
            </Section>
          )}

          <Section title="What to send" id={id("reqs")}
            aside={requirements.length > 0 && (
              <span style={{ fontFamily: SANS, fontSize: "0.93rem", fontWeight: 700, color: TEXT_MUTED, fontVariantNumeric: "tabular-nums" }}>
                {doneCount} of {requirements.length} done
              </span>
            )}>
            {requirements.length === 0 ? (
              <p style={{ ...text, color: TEXT_MID }}>Talon didn't find a list of requirements. Its page will have them.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                {requirements.map((req, i) => {
                  const on = done.has(i);
                  return (
                    <li key={`${i}-${req}`}>
                      <label className={CHOICE_CLASS} style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer",
                        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "10px 12px",
                        minHeight: 44, boxSizing: "border-box" }}>
                        <input type="checkbox" checked={on} onChange={() => toggleReq(i)} style={SR_ONLY} />
                        <span aria-hidden="true" style={{ flexShrink: 0, width: 22, height: 22, marginTop: 1, borderRadius: 6,
                          border: `2px solid ${on ? ink.ring : "#8a857c"}`, background: on ? ink.button.bg : WHITE,
                          color: ink.button.fg, display: "flex", alignItems: "center", justifyContent: "center",
                          boxSizing: "border-box" }}>
                          {on && <PixelStamp kind="check" size={16} />}
                        </span>
                        <span style={{ fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600, lineHeight: 1.5,
                          color: TEXT_MID, overflowWrap: "anywhere", textDecoration: on ? "line-through" : "none" }}>
                          {req}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {essay && (
              <p style={{ ...text, marginTop: 10, fontSize: "0.95rem", color: TEXT_MID }}>
                Talon doesn't write essays. To brainstorm yours, talk it through in Chat.
              </p>
            )}
          </Section>

          <Section title="Where it stands" id={id("status")}>
            <label htmlFor={id("status-select")} style={SR_ONLY}>Status</label>
            <select id={id("status-select")} className={INPUT_CLASS} value={item.status}
              onChange={(e) => onChange({ status: e.target.value })}
              style={{ ...inputStyle, cursor: "pointer" }}>
              {statusOptions.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            {item.status === "done" && (
              <fieldset style={{ border: "none", margin: "12px 0 0", padding: 0, minWidth: 0 }}>
                <legend style={{ padding: 0, marginBottom: 8, fontFamily: SANS, fontSize: "0.98rem", fontWeight: 700, color: TEXT }}>
                  How did it go?
                </legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    { key: "yes", label: outcomeLabel(item.lane, "yes") },
                    { key: "no", label: outcomeLabel(item.lane, "no") },
                    { key: null, label: "No result yet" },
                  ].map((o) => {
                    const on = (item.outcome ?? null) === o.key;
                    return (
                      <label key={o.key ?? "none"} className={CHOICE_CLASS}
                        style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 14px",
                          borderRadius: RADIUS.pill, cursor: "pointer", boxSizing: "border-box", fontFamily: SANS,
                          fontSize: "0.95rem", fontWeight: 700, border: `1.5px solid ${on ? ink.ring : BORDER}`,
                          background: on ? ink.softer : WHITE, color: on ? ink.onSoft : TEXT_MID }}>
                        <input type="radio" name={id("outcome")} checked={on} onChange={() => onChange({ outcome: o.key })}
                          style={SR_ONLY} />
                        {o.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </Section>

          <Section title="Your notes" id={id("notes-title")}
            aside={notes.length > NOTES_MAX * 0.9 ? <Counter id={id("notes-count")} n={notes.length} max={NOTES_MAX} /> : null}>
            <label htmlFor={id("notes")} style={SR_ONLY}>Your notes</label>
            <textarea id={id("notes")} className={INPUT_CLASS} value={notes} maxLength={NOTES_MAX} rows={4}
              onChange={(e) => setNotes(e.target.value)} onBlur={flushNotes}
              placeholder="Who to ask for a recommendation, what to write about..."
              style={{ ...inputStyle, minHeight: 104, resize: "vertical" }} />
            <p style={{ ...text, marginTop: 4, fontSize: "0.92rem", color: TEXT_MUTED }}>Only you can see these. Saved as you go.</p>
          </Section>

          <Section title="Recheck its page" id={id("recheck")}>
            <p style={{ ...text, fontSize: "0.95rem", color: TEXT_MID }}>
              Talon reads its page again and tells you if the deadline or the money changed.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 12px", marginTop: 10 }}>
              <button type="button" className={FOCUS_CLASS} onClick={runRecheck}
                aria-disabled={!!recheckStop || rechecking || undefined} aria-busy={rechecking || undefined}
                aria-describedby={id("recheck-left")}
                style={{ ...secondary, cursor: recheckStop || rechecking ? "default" : "pointer",
                  color: recheckStop ? TEXT_MUTED : TEXT_MID, background: recheckStop ? SURFACE : WHITE }}>
                {rechecking ? <Spinner size={16} color={ink.text} /> : <PixelStamp kind="sparkle" size={16} />}
                {rechecking ? "Rechecking..." : "Recheck"}
              </button>
              <span id={id("recheck-left")} style={{ fontFamily: SANS, fontSize: "0.93rem", fontWeight: 700, color: TEXT_MUTED,
                fontVariantNumeric: "tabular-nums" }}>
                {recheckStop || `${plural(perItem, "recheck")} left for this one`}
              </span>
            </div>
            <div ref={recheckRef} role="status" aria-live="polite" style={{ marginTop: recheck || recheckError ? 10 : 0 }}>
              {recheckError && (
                <p style={{ ...text, fontWeight: 700, color: DANGER }}>{recheckError}</p>
              )}
              {recheck && (
                recheck.gone ? (
                  <p style={{ ...text, fontWeight: 700, color: AMBER_TEXT }}>{TALON_LINES.recheckGone}</p>
                ) : recheck.changed.length ? (
                  <div>
                    <p style={{ ...text, fontWeight: 800 }}>What changed</p>
                    <Lines items={recheck.changed} icon="clock" />
                  </div>
                ) : (
                  <p style={{ ...text, fontWeight: 700 }}>{TALON_LINES.recheckDone}</p>
                )
              )}
            </div>
          </Section>
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}`, background: WHITE, padding: "12px 20px",
          paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
          {error && (
            <p role="alert" style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 700, color: DANGER, lineHeight: 1.45 }}>
              {error}
            </p>
          )}
          {confirming ? (
            <div role="group" aria-labelledby={id("confirm-delete")}>
              <p id={id("confirm-delete")} style={{ margin: "0 0 10px", fontFamily: SANS, fontSize: "1rem", fontWeight: 700,
                color: TEXT, lineHeight: 1.45 }}>
                Delete this from your board? Your notes go with it, and a later find could bring it back. To keep it from
                coming back, dismiss it instead.
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" autoFocus className={FOCUS_CLASS} onClick={() => setConfirming(false)} disabled={deleting}
                  style={{ ...secondary, flex: "1 1 120px" }}>
                  Keep it
                </button>
                <button type="button" className={`${FOCUS_CLASS} ${PRESS_CLASS}`} onClick={remove} disabled={deleting}
                  style={{ ...secondary, flex: "1 1 120px", border: "none", background: DANGER, color: WHITE,
                    cursor: deleting ? "default" : "pointer" }}>
                  {deleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button type="button" className={FOCUS_CLASS} onClick={dismissOrRestore} style={{ ...secondary, flex: "1 1 140px" }}>
                {item.status === "dismissed" ? "Bring it back" : "Dismiss"}
              </button>
              <button type="button" className={FOCUS_CLASS} onClick={() => { setError(null); setConfirming(true); }}
                style={{ ...secondary, flex: "1 1 140px", color: DANGER, border: "1.5px solid #f1c4bf" }}>
                Delete
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
