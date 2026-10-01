import {
  AMBER_TEXT, DANGER, FOCUS_CLASS, SANS, TEXT_FAINT, useAgentInk,
} from "../agentUi.js";

// Small pieces shared by the New outreach flow and the Review screen: buttons,
// fields, notices, and the few CSS rules inline styles cannot express (focus
// on a card that wraps a radio, the flash when a claim and its source link up).
// Calm shell: white cards on #F5F5F5, the accent for chrome only.

export const FLASH_CLASS = "oa-flash";
export const PULSE_CLASS = "oa-pulse";

const FLOW_CSS = `
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

// The general pieces moved to the shared kit; re-exported so the outreach
// screens keep importing them from here.
export {
  INPUT_CLASS, CHOICE_CLASS, LINK_CLASS, SR_ONLY, textOnPage, Button, LinkButton, Card, FieldLabel, inputStyle,
  Notice, Heading,
} from "../../ui/kit.jsx";
import { LINK_CLASS, SR_ONLY, textOnPage } from "../../ui/kit.jsx";

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
