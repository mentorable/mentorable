import { useEffect, useId } from "react";
import Spinner from "../common/Spinner.jsx";
import { readableOn } from "../../lib/theme.js";
import { PixelStamp, stampWidth } from "./PixelIcons.jsx";
import {
  AMBER_BG, AMBER_EDGE, AMBER_LINE, AMBER_TEXT, BG, BORDER, DANGER, DANGER_BG, DANGER_LINE, FOCUS_CLASS, PRESS_CLASS, RADIUS, SANS,
  SURFACE, TEXT, TEXT_MID, TEXT_MUTED, WHITE, ringVar, useAgentInk,
} from "./tokens.js";

// The dialog: a bottom sheet on a phone, a centred card above that.
export { default as Sheet } from "./Sheet.jsx";

// The shared kit every page builds from: the calm shell's buttons, cards,
// fields, notices and headings (first made for the Agents pages), plus the
// page header, the Tip guide line, choice chips and the toast. Character
// comes from the pixel stamps here, never louder chrome. The pixel speech box
// belongs to the agents' mascots alone (MascotSays).

export const INPUT_CLASS = "oa-input";
export const CHOICE_CLASS = "oa-choice";
export const LINK_CLASS = "oa-link";
export const REMOVE_CLASS = "ui-remove";
export const QUIET_CLASS = "ui-quiet";

const KIT_CSS = `
.${INPUT_CLASS} { transition: border-color 0.15s; }
.${INPUT_CLASS}:focus { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 1px; }
.${CHOICE_CLASS}:has(input:focus-visible) { outline: 3px solid var(--ag-ring, #1d4ed8); outline-offset: 2px; }
.${LINK_CLASS} { text-decoration: underline; text-underline-offset: 3px; }
.${LINK_CLASS}:hover { text-decoration-thickness: 2px; }
.ui-page input::placeholder, .ui-page textarea::placeholder { color: ${TEXT_MUTED}; opacity: 1; }
.${REMOVE_CLASS} { color: ${TEXT_MID}; background: none; transition: color 0.15s, background 0.15s; }
.${REMOVE_CLASS}:hover, .${REMOVE_CLASS}:focus-visible { color: ${DANGER}; background: ${BG}; }
.${QUIET_CLASS} { background: transparent; transition: background 0.15s; }
.${QUIET_CLASS}:hover:not(:disabled), .${QUIET_CLASS}:focus-visible { background: ${BG}; text-decoration: underline; text-underline-offset: 3px; }
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
 *  "quiet" (text only; on hover or keyboard focus a grey tint and an
 *  underline, so the cue shows on a white card and on the grey page alike),
 *  "danger", "warn" (amber, the one button for catching up: being behind is
 *  amber, never red). Always at least 44px tall. */
export function Button({ kind = "secondary", busy = false, disabled, children, style, type = "button", ...rest }) {
  const ink = useAgentInk();
  const off = disabled || busy;
  // A quiet button has no fill of its own, so it is often on the grey page.
  const quietText = textOnPage(ink);
  const look = {
    primary: { background: ink.button.bg, color: ink.button.fg, border: `2px solid ${ink.button.bg}` },
    secondary: { background: WHITE, color: TEXT_MID, border: `1.5px solid ${BORDER}` },
    // No background here: QUIET_CLASS sets it, so its hover tint can win.
    quiet: { color: quietText, border: "1.5px solid transparent" },
    danger: { background: WHITE, color: DANGER, border: `1.5px solid ${DANGER}` },
    warn: { background: AMBER_BG, color: AMBER_TEXT, border: `1.5px solid ${AMBER_EDGE}` },
  }[kind] || {};
  const cls = kind === "primary" ? PRESS_CLASS : kind === "quiet" ? QUIET_CLASS : "";
  return (
    <button type={type} className={`${FOCUS_CLASS} ${cls}`} disabled={off}
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
export function Card({ children, style, as: El = "div", ...rest }) {
  return (
    <El style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.card, padding: "1.1rem 1.2rem",
      boxSizing: "border-box", minWidth: 0, ...style }} {...rest}>
      {children}
    </El>
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
        <p style={{ margin: "2px 0 0", fontFamily: SANS, fontSize: "0.9rem", color: TEXT_MUTED, lineHeight: 1.5 }}>{hint}</p>
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
  warn: { bg: AMBER_BG, fg: AMBER_TEXT, line: AMBER_LINE },
  error: { bg: DANGER_BG, fg: DANGER, line: DANGER_LINE },
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
  const El = level === 3 ? "h3" : "h2";
  return (
    <El id={id} style={{ margin: 0, fontFamily: SANS, fontWeight: 800, color: TEXT, letterSpacing: "-0.01em",
      fontSize: level === 3 ? "1.1rem" : "1.3rem", lineHeight: 1.3, ...style }}>
      {children}
    </El>
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
 *  colour set once for everything inside. On a phone the bottom padding
 *  clears the 60px nav and the floating feedback button above it, so the
 *  last button on a page is never under either. The padding is four
 *  longhands, never the shorthand, so a page can override one side (Quest's
 *  map zeroes the top) without React warning about a conflicting property. */
export function pageStyle({ isMobile, sidebar = 0, ink }) {
  return {
    minHeight: "100vh", background: BG, fontFamily: SANS, boxSizing: "border-box",
    paddingTop: isMobile ? "1.5rem" : "2.5rem",
    paddingRight: isMobile ? "1rem" : "2rem",
    paddingBottom: isMobile ? "8.5rem" : "4rem",
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

/** A guide line: a pixel stamp beside a plain card. For tips, next steps and
 *  empty states on every page. `name` says whose line it is, to screen
 *  readers only. `maxWidth`: the card's cap (640 by default, a comfortable
 *  measure); "none" lets a read-out line run the column beside full-width cards. */
export function Tip({ name, stamp = "sparkle", tone = "accent", maxWidth = 640, children, style }) {
  const ink = useAgentInk();
  const accent = tone === "accent";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, minWidth: 0, ...style }}>
      <span aria-hidden="true" style={{ flexShrink: 0, width: 40, height: 40, marginTop: 4, borderRadius: RADIUS.control,
        background: ink.soft, color: ink.onSoft, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <PixelStamp kind={stamp} size={24} />
      </span>
      <div style={{ flex: "1 1 auto", minWidth: 0, maxWidth, boxSizing: "border-box", padding: "12px 16px",
        background: accent ? ink.softer : WHITE, border: `1px solid ${accent ? ink.soft : BORDER}`,
        borderRadius: RADIUS.card, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.5,
        overflowWrap: "anywhere" }}>
        {name && <span style={SR_ONLY}>{name}: </span>}
        {children}
      </div>
    </div>
  );
}

/** A labelled row of pills, one of them chosen (an order, a view, a filter).
 *  On a phone the pills share the row evenly, unless `wrap`.
 *  `multi`: several may be on (the grades an activity ran); `value` is then
 *  an array, a press toggles one, and the result keeps the options' order.
 *  `labelAbove`: the label shows above the pills at every width, as a form
 *  field's label does (the pills then wrap). `labelledBy`: the id of a label
 *  already on the page, used instead of `label`. */
export function ChoiceChips({ label, options, value, onChange, isMobile, hideLabel, multi = false, labelAbove = false,
  labelledBy, wrap = false }) {
  const ink = useAgentInk();
  const ownId = useId();
  const chosen = multi ? (Array.isArray(value) ? value : []) : null;
  const press = (key) => {
    if (!multi) { onChange(key); return; }
    const next = chosen.includes(key) ? chosen.filter((k) => k !== key) : [...chosen, key];
    onChange(options.map((o) => o.key).filter((k) => next.includes(k)));
  };
  const grid = isMobile && !wrap && !labelAbove;
  const inlineLabel = !labelAbove && !labelledBy;
  const group = (
    <div role="group" aria-label={inlineLabel ? label : undefined}
      aria-labelledby={labelledBy || (labelAbove ? ownId : undefined)}
      style={grid ? { display: "grid", gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 8 }
        : { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {inlineLabel && (
        <span style={isMobile || hideLabel ? SR_ONLY : { fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", color: TEXT_MID }}>
          {label}
        </span>
      )}
      {options.map((o) => {
        const on = multi ? chosen.includes(o.key) : value === o.key;
        return (
          <button key={o.key} type="button" aria-pressed={on} onClick={() => press(o.key)} className={FOCUS_CLASS}
            style={{ fontFamily: SANS, fontWeight: 700, fontSize: "0.95rem", cursor: "pointer", borderRadius: RADIUS.pill,
              padding: grid ? "4px 8px" : "0 14px", minHeight: 44, lineHeight: 1.2, boxSizing: "border-box",
              // A one-character pill ("9") is still a full touch target. In
              // the phone grid the column already stretches every pill.
              ...(grid ? null : { minWidth: 44 }),
              border: `1.5px solid ${on ? ink.text : BORDER}`, background: on ? ink.softer : WHITE,
              color: on ? ink.onSoft : TEXT_MID }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
  if (!labelAbove) return group;
  // The same line as FieldLabel, but not a <label>: a group of buttons is
  // named by aria-labelledby, not by a label's `for`.
  return (
    <div style={{ minWidth: 0 }}>
      <div id={ownId} style={{ marginBottom: 6, fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT }}>{label}</div>
      {group}
    </div>
  );
}

/** A small label pill (an item's kind, "Needs detail"): the accent tint with
 *  its readable ink, at the 0.9rem caption step, with an optional 16px pixel
 *  stamp before the words. Not a control: for a choice use ChoiceChips. */
export function Tag({ children, stamp, style }) {
  const ink = useAgentInk();
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: SANS, fontSize: "0.9rem",
      fontWeight: 700, lineHeight: 1.3, color: ink.onSoft, background: ink.softer, border: `1px solid ${ink.soft}`,
      borderRadius: RADIUS.pill, padding: "3px 10px", boxSizing: "border-box", maxWidth: "100%", ...style }}>
      {stamp && <PixelStamp kind={stamp} size={16} />}
      {children}
    </span>
  );
}

// ─── Remove ──────────────────────────────────────────────────────────────────

const RemoveX = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
    aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/** "× Remove", named for what it removes (`name`: "Honors Chemistry"). Quiet
 *  until hovered or focused, then red on a grey tint, the same for mouse and
 *  keyboard. `iconOnly` drops the word where a row is tight (a phone card);
 *  the accessible name stays. At least 44px unless `style` says otherwise. */
export function RemoveButton({ onClick, name, iconOnly = false, disabled, style, ...rest }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={name ? `Remove ${name}` : "Remove"}
      className={`${FOCUS_CLASS} ${REMOVE_CLASS}`}
      style={{ flexShrink: 0, minHeight: 44, minWidth: 44, padding: iconOnly ? 0 : "0 10px", border: "none",
        borderRadius: RADIUS.control, cursor: disabled ? "default" : "pointer", fontFamily: SANS, fontWeight: 700,
        fontSize: "0.95rem", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        boxSizing: "border-box", opacity: disabled ? 0.55 : 1, ...style }}
      {...rest}>
      <RemoveX />{!iconOnly && "Remove"}
    </button>
  );
}

// ─── Toast ───────────────────────────────────────────────────────────────────

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** A notice that floats at the bottom of the screen (above the mobile nav),
 *  so feedback for an action stays in view wherever the action was. On a
 *  phone it starts right of MobileNav's floating feedback button (12px gutter,
 *  the 44px button, 12px gap), so it never covers it. Polite
 *  live region; errors use the error tone.
 *
 *  `notice`: { text, error, action, undo }. `action` is any element (a Retry
 *  button). `undo`, a function, draws the Undo button itself, with the
 *  Ctrl+Z (Cmd+Z on a Mac) shortcut and its hint, and owns the shortcut while
 *  the toast is up, outside text fields so a field's own undo still works. */
export function Toast({ notice, onDismiss, isMobile, sidebar = 0 }) {
  const undo = notice?.undo;
  useEffect(() => {
    if (typeof undo !== "function") return undefined;
    const onKey = (e) => {
      if (e.key.toLowerCase() !== "z" || e.shiftKey || e.altKey || !(IS_MAC ? e.metaKey : e.ctrlKey)) return;
      const t = e.target;
      if (t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const action = notice?.action || (typeof undo === "function" ? (
    <Button kind="quiet" onClick={undo} style={{ padding: "6px 10px", marginLeft: -10 }}
      aria-keyshortcuts={IS_MAC ? "Meta+Z" : "Control+Z"}>
      Undo
      {!isMobile && <span style={{ fontWeight: 600, color: TEXT_MUTED }}>{IS_MAC ? "⌘Z" : "Ctrl+Z"}</span>}
    </Button>
  ) : null);

  return (
    <div aria-live="polite" style={{ position: "fixed", zIndex: 300, pointerEvents: "none", display: "flex",
      justifyContent: "center", left: isMobile ? 12 + 44 + 12 : sidebar + 16, right: 12,
      bottom: isMobile ? "calc(60px + env(safe-area-inset-bottom, 0px) + 12px)" : 24 }}>
      {notice && (
        <div style={{ width: "100%", maxWidth: 560, pointerEvents: "auto", borderRadius: RADIUS.control,
          boxShadow: "0 14px 36px rgba(20,20,19,0.16)" }}>
          {/* Notice spreads `style` last, so an error passes none: a background
              key set to undefined would wipe the error tint and leave the words
              floating on the page. */}
          <Notice tone={notice.error ? "error" : "info"} onDismiss={onDismiss} action={action}
            style={notice.error ? undefined : { background: WHITE }}>
            {notice.text}
          </Notice>
        </div>
      )}
    </div>
  );
}
