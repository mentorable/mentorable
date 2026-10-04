import Spinner from "../common/Spinner.jsx";
import { readableOn } from "../../lib/theme.js";
import { SpeechBubble } from "./SpeechBubble.jsx";
import { PixelStamp, stampWidth } from "./PixelIcons.jsx";
import {
  AMBER_BG, AMBER_TEXT, BG, BORDER, DANGER, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS, SURFACE, TEXT,
  TEXT_MID, TEXT_MUTED, WHITE, ringVar, useAgentInk,
} from "./tokens.js";

// The shared kit every page builds from: the calm shell's buttons, cards,
// fields, notices and headings (first made for the Agents pages), plus the
// page header, the Tip guide bubble, choice chips and the toast. Character
// comes from the pixel stamps and speech bubbles here, never louder chrome.

export const INPUT_CLASS = "oa-input";
export const CHOICE_CLASS = "oa-choice";
export const LINK_CLASS = "oa-link";

const KIT_CSS = `
.${INPUT_CLASS} { transition: border-color 0.15s; }
.${INPUT_CLASS}:focus { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 1px; }
.${CHOICE_CLASS}:has(input:focus-visible) { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 2px; }
.${LINK_CLASS} { text-decoration: underline; text-underline-offset: 3px; }
.${LINK_CLASS}:hover { text-decoration-thickness: 2px; }
.ui-page input::placeholder, .ui-page textarea::placeholder { color: ${TEXT_MUTED}; opacity: 1; }
`;
if (typeof document !== "undefined" && !document.querySelector("style[data-ui-kit]")) {
  const el = document.createElement("style");
  el.dataset.uiKit = "";
  el.textContent = KIT_CSS;
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

// ─── Page frame ──────────────────────────────────────────────────────────────

/** Every page's title block: the accent title the Agents hub set, a line or
 *  two under it, and room on the right for a page-level action. */
export function PageHeader({ title, children, action, isMobile, style }) {
  const ink = useAgentInk();
  return (
    <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap",
      margin: "0 0 1.6rem", ...style }}>
      <div style={{ minWidth: 0, flex: "1 1 320px" }}>
        <h1 style={{ fontFamily: SANS, fontWeight: 800, fontSize: isMobile ? "2.1rem" : "2.5rem", color: ink.title,
          letterSpacing: "-0.03em", margin: "0 0 0.5rem", lineHeight: 1.1 }}>
          {title}
        </h1>
        {children && (
          <div style={{ fontFamily: SANS, fontSize: isMobile ? "1.05rem" : "1.15rem", color: TEXT_MUTED, lineHeight: 1.6,
            maxWidth: "62ch" }}>
            {children}
          </div>
        )}
      </div>
      {action}
    </header>
  );
}

/** The standard page wrapper: grey page, sidebar offset, the focus ring
 *  colour set once for everything inside. */
export function pageStyle({ isMobile, sidebar = 0, ink }) {
  return {
    minHeight: "100vh", background: BG, fontFamily: SANS, boxSizing: "border-box",
    padding: isMobile ? "1.5rem 1rem 6rem" : "2.5rem 2rem 4rem",
    paddingLeft: isMobile ? "1rem" : `calc(${sidebar}px + 2rem)`,
    ...ringVar(ink),
  };
}

// ─── Character ───────────────────────────────────────────────────────────────

/** A pixel stamp sitting on a soft tile of the accent: the small badge each
 *  page uses for its marks (a College List group, a Quest milestone). */
export function StampTile({ kind, size = 40, lit = true, title }) {
  const ink = useAgentInk();
  return (
    <span role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}
      style={{ flexShrink: 0, width: size, height: size, borderRadius: RADIUS.control, display: "inline-flex",
        alignItems: "center", justifyContent: "center", boxSizing: "border-box",
        background: lit ? ink.softer : "#efedf3", border: `1px solid ${lit ? ink.soft : BORDER}`,
        color: lit ? ink.onSoft : TEXT_MUTED }}>
      {/* A 16-pixel stamp draws at 2 CSS px a pixel on a full tile, an 8-pixel one at 3. */}
      <PixelStamp kind={kind} size={stampWidth(kind) === 16 ? (size >= 40 ? 32 : 16) : (size >= 40 ? 24 : 16)} />
    </span>
  );
}

/** A guide line in the game dialog box: a pixel stamp beside a speech bubble
 *  with a name tab. For tips, next steps and empty states on every page. */
export function Tip({ name = "Tip", stamp = "sparkle", tone = "accent", children, style }) {
  const ink = useAgentInk();
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, minWidth: 0, paddingTop: 12, ...style }}>
      <span aria-hidden="true" style={{ flexShrink: 0, width: 40, height: 40, marginTop: 14, borderRadius: RADIUS.control,
        background: ink.soft, color: ink.onSoft, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <PixelStamp kind={stamp} size={24} />
      </span>
      <SpeechBubble side="left" tone={tone} name={name} style={{ flex: "1 1 auto", maxWidth: 640 }}>
        {children}
      </SpeechBubble>
    </div>
  );
}

// ─── Choices ─────────────────────────────────────────────────────────────────

/** A labelled row of pills, one of them chosen (an order, a view, a filter).
 *  On a phone the pills share the row evenly. */
export function ChoiceChips({ label, options, value, onChange, isMobile, hideLabel }) {
  const ink = useAgentInk();
  return (
    <div role="group" aria-label={label}
      style={isMobile ? { display: "grid", gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 8 }
        : { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span style={isMobile || hideLabel ? SR_ONLY : { fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: TEXT_MID }}>
        {label}
      </span>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button key={o.key} type="button" aria-pressed={on} onClick={() => onChange(o.key)} className={FOCUS_CLASS}
            style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", borderRadius: RADIUS.pill,
              padding: isMobile ? "4px 8px" : "0 14px", minHeight: 44, lineHeight: 1.2, boxSizing: "border-box",
              border: `1.5px solid ${on ? ink.text : BORDER}`, background: on ? ink.softer : WHITE,
              color: on ? ink.onSoft : TEXT_MID }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

/** A notice that floats at the bottom of the screen (above the mobile nav),
 *  so feedback for an action stays in view wherever the action was. Polite
 *  live region; errors use the error tone. */
export function Toast({ notice, onDismiss, isMobile, sidebar = 0 }) {
  return (
    <div aria-live="polite" style={{ position: "fixed", zIndex: 300, pointerEvents: "none", display: "flex",
      justifyContent: "center", left: isMobile ? 12 : sidebar + 16, right: 12,
      bottom: isMobile ? "calc(60px + env(safe-area-inset-bottom, 0px) + 12px)" : 24 }}>
      {notice && (
        <div style={{ width: "100%", maxWidth: 560, pointerEvents: "auto", borderRadius: RADIUS.control,
          boxShadow: "0 14px 36px rgba(20,20,19,0.16)" }}>
          <Notice tone={notice.error ? "error" : "info"} onDismiss={onDismiss} action={notice.action}
            style={{ background: notice.error ? undefined : WHITE }}>
            {notice.text}
          </Notice>
        </div>
      )}
    </div>
  );
}
