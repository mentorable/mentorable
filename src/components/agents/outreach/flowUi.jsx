import Spinner from "../../common/Spinner.jsx";
import { readableOn } from "../../../lib/theme.js";
import {
  AMBER_BG, AMBER_TEXT, BG, BORDER, DANGER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_FAINT,
  TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../agentUi.js";

// Small pieces shared by the New outreach flow and the Review screen: buttons,
// fields, notices, and the few CSS rules inline styles cannot express (focus
// on a card that wraps a radio, the flash when a claim and its source link up).
// Calm shell: white cards on #F5F5F5, the accent for chrome only.

export const INPUT_CLASS = "oa-input";
export const CHOICE_CLASS = "oa-choice";
export const FLASH_CLASS = "oa-flash";
export const LINK_CLASS = "oa-link";
export const PULSE_CLASS = "oa-pulse";

const FLOW_CSS = `
.${INPUT_CLASS} { transition: border-color 0.15s; }
.${INPUT_CLASS}:focus { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 1px; }
.${CHOICE_CLASS}:has(input:focus-visible) { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 2px; }
.${LINK_CLASS} { text-decoration: underline; text-underline-offset: 3px; }
.${LINK_CLASS}:hover { text-decoration-thickness: 2px; }
@keyframes oa-flash-kf { 0% { box-shadow: 0 0 0 0 rgba(var(--accent-rgb, 29,78,216), 0.55); } 100% { box-shadow: 0 0 0 10px rgba(var(--accent-rgb, 29,78,216), 0); } }
.${FLASH_CLASS} { animation: oa-flash-kf 0.9s ease-out 2; }
@keyframes oa-mark-kf { 0%, 100% { filter: none; } 50% { filter: brightness(0.82); } }
mark.${FLASH_CLASS} { animation: oa-mark-kf 0.45s ease-in-out 3; }
@keyframes oa-pulse-kf { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
.${PULSE_CLASS} { animation: oa-pulse-kf 1.2s steps(2, jump-none) infinite; }
@media (prefers-reduced-motion: reduce) { .${FLASH_CLASS}, mark.${FLASH_CLASS}, .${PULSE_CLASS} { animation: none; } }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-outreach-flow]")) {
  const el = document.createElement("style");
  el.dataset.outreachFlow = "";
  el.textContent = FLOW_CSS;
  document.head.appendChild(el);
}

export const SR_ONLY = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden",
  clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};

/** The accent as body text that may sit straight on the page (#F5F5F5).
 *  agentUi's `ink.text` is tuned for white and falls just short of 4.5:1 on
 *  the grey page for most accents; this one passes there, and so on white too. */
export function textOnPage(ink) {
  return readableOn(ink.accent, BG, 4.5);
}

/** kind: "primary" (the readable accent fill), "secondary" (outlined),
 *  "quiet" (text only), "danger". Always at least 44px tall. */
export function Button({ kind = "secondary", busy = false, disabled, children, style, type = "button", ...rest }) {
  const ink = useAgentInk();
  const off = disabled || busy;
  // A quiet button has no fill of its own, so it is often on the grey page.
  const quietText = textOnPage(ink);
  const look = {
    primary: { background: ink.button.bg, color: ink.button.fg, border: `2px solid ${ink.button.bg}` },
    secondary: { background: WHITE, color: TEXT_MID, border: `1.5px solid ${BORDER}` },
    quiet: { background: "transparent", color: quietText, border: "1.5px solid transparent" },
    danger: { background: WHITE, color: DANGER, border: `1.5px solid ${DANGER}` },
  }[kind];
  return (
    <button type={type} className={`${FOCUS_CLASS} ${kind === "primary" ? PRESS_CLASS : ""}`} disabled={off}
      aria-busy={busy || undefined}
      style={{ fontFamily: SANS, fontSize: "1rem", fontWeight: 700, minHeight: 44, padding: "10px 18px",
        borderRadius: RADIUS.control, cursor: off ? "default" : "pointer", display: "inline-flex", alignItems: "center",
        justifyContent: "center", gap: 8, lineHeight: 1.25, textAlign: "center", boxSizing: "border-box",
        opacity: disabled && !busy ? 0.55 : 1, ...look, ...style }}
      {...rest}>
      {busy && <Spinner size={16} color={kind === "primary" ? ink.button.fg : quietText} />}
      {children}
    </button>
  );
}

/** A link that looks like a secondary Button (the mailto: "Open in my mail
 *  app"). Disabled: not followed, and dimmed. */
export function LinkButton({ href, disabled = false, children, style, ...rest }) {
  return (
    <a href={disabled ? undefined : href} aria-disabled={disabled || undefined} className={FOCUS_CLASS}
      onClick={(e) => { if (disabled) e.preventDefault(); }}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44,
        padding: "10px 18px", boxSizing: "border-box", borderRadius: RADIUS.control, border: `1.5px solid ${BORDER}`,
        background: WHITE, color: TEXT_MID, fontFamily: SANS, fontSize: "1rem", fontWeight: 700, lineHeight: 1.25,
        textDecoration: "none", textAlign: "center", opacity: disabled ? 0.55 : 1, cursor: disabled ? "default" : "pointer",
        ...style }}
      {...rest}>
      {children}
    </a>
  );
}

/** A white card, the calm shell's one container. */
export function Card({ children, style, as: Tag = "div", ...rest }) {
  return (
    <Tag style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "1.1rem 1.2rem",
      boxSizing: "border-box", minWidth: 0, ...style }} {...rest}>
      {children}
    </Tag>
  );
}

export function FieldLabel({ htmlFor, children, hint, optional }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label htmlFor={htmlFor} style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT }}>
        {children}
        {optional && <span style={{ fontWeight: 600, color: TEXT_MUTED }}> (optional)</span>}
      </label>
      {hint && (
        <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "0.92rem", color: TEXT_MUTED, lineHeight: 1.5 }}>{hint}</p>
      )}
    </div>
  );
}

export const inputStyle = {
  width: "100%", boxSizing: "border-box", fontFamily: SANS, fontSize: "1rem", color: TEXT, background: WHITE,
  border: `1.5px solid ${BORDER}`, borderRadius: RADIUS.control, padding: "11px 13px", minHeight: 46, lineHeight: 1.5,
};

/** "42 / 300", amber once within 10% of the cap. */
export function Counter({ n, max, id, unit = "" }) {
  const near = n > max * 0.9;
  return (
    <span id={id} style={{ fontFamily: SANS, fontSize: "0.9rem", fontWeight: 600, fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap", flexShrink: 0,
      color: n > max ? DANGER : near ? AMBER_TEXT : TEXT_FAINT }}>
      {n} / {max}{unit}
    </span>
  );
}

const TONES = {
  info: { bg: SURFACE, fg: TEXT_MID, line: BORDER },
  success: { bg: null, fg: TEXT, line: null },
  warn: { bg: AMBER_BG, fg: AMBER_TEXT, line: "#f3d9a4" },
  error: { bg: "#fdf1f0", fg: DANGER, line: "#f4c7c2" },
};

/** A one-line (or short) message with an optional dismiss. `tone`: info,
 *  success (a soft accent tint), warn (amber, for "not yet" and "behind"),
 *  error. Errors are announced (role alert); the rest are polite. */
export function Notice({ tone = "info", children, onDismiss, style, action }) {
  const ink = useAgentInk();
  const t = TONES[tone] || TONES.info;
  const bg = t.bg || ink.softer;
  const line = t.line || ink.soft;
  return (
    <div role={tone === "error" ? "alert" : "status"}
      style={{ display: "flex", alignItems: "flex-start", gap: 10, background: bg, border: `1px solid ${line}`,
        borderRadius: RADIUS.control, padding: "10px 12px 10px 14px", fontFamily: SANS, fontSize: "1rem",
        fontWeight: 600, color: tone === "success" ? TEXT : t.fg, lineHeight: 1.5, ...style }}>
      <div style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
        {children}
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
      {onDismiss && (
        <button type="button" className={FOCUS_CLASS} onClick={onDismiss} aria-label="Dismiss"
          style={{ flexShrink: 0, width: 44, height: 44, margin: "-10px -8px -10px 0", border: "none", background: "none",
            cursor: "pointer", color: TEXT_MUTED, borderRadius: 10, display: "flex", alignItems: "center",
            justifyContent: "center" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"
            strokeLinecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** A section heading inside a step or the review screen. */
export function Heading({ children, id, level = 2, style }) {
  const Tag = level === 3 ? "h3" : "h2";
  return (
    <Tag id={id} style={{ margin: 0, fontFamily: SANS, fontWeight: 800, color: TEXT, letterSpacing: "-0.01em",
      fontSize: level === 3 ? "1.1rem" : "1.3rem", lineHeight: 1.3, ...style }}>
      {children}
    </Tag>
  );
}

/** The host of a URL, without "www.". "" when it cannot be read. */
export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Only http(s) links are ever rendered as links. */
export function safeHref(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** A link to a source page, opening in a new tab. Shows the domain.
 *  Students are told to open every source before they send, often on a
 *  phone, so each link is a 44px-tall target by default (it still sits in a
 *  line of text; the line just grows). `inline`: a plain link inside running
 *  text, for the rare sentence where a taller line would read badly. */
export function SourceLink({ url, children, style, inline = false }) {
  const ink = useAgentInk();
  const href = safeHref(url);
  if (!href) return <span style={style}>{children || domainOf(url)}</span>;
  const target = inline ? null : {
    display: "inline-flex", alignItems: "center", minHeight: 44, maxWidth: "100%", boxSizing: "border-box",
  };
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${FOCUS_CLASS} ${LINK_CLASS}`}
      style={{ fontFamily: SANS, fontWeight: 700, color: textOnPage(ink), overflowWrap: "anywhere", borderRadius: 4,
        ...target, ...style }}>
      {children || domainOf(url) || "Open the page"}
      <span style={SR_ONLY}> (opens in a new tab)</span>
    </a>
  );
}

// ── Remembered per student, in this browser ──────────────────────────────────

export function readLocal(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
export function writeLocal(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked: the default comes back next time */ }
}
