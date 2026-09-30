import { useEffect, useRef } from "react";
import { BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, WHITE, useAgentInk } from "../agentUi.js";
import { SCROLL_CLASS, SR_ONLY } from "./BoardUi.js";

// The stages on a phone: a strip of tabs with a count each, scrolling
// sideways inside itself (never the page), one stage shown at a time. Tabs in
// the ARIA pattern: one tab stop, arrow keys move between them and select.
// The strip is position: relative so the screen-reader-only counts (absolutely
// positioned) scroll with it instead of widening the page.

export const tabId = (key) => `ob-tab-${key}`;
export const PANEL_ID = "ob-tab-panel";

export default function BoardTabs({ stages, counts, value, onChange }) {
  const ink = useAgentInk();
  const stripRef = useRef(null);

  // Keep the selected tab in view by scrolling the strip itself, so the page
  // never jumps.
  useEffect(() => {
    const strip = stripRef.current;
    const tab = strip?.querySelector(`[data-tab="${value}"]`);
    if (!strip || !tab) return;
    const left = tab.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft;
    const right = left + tab.offsetWidth;
    if (left < strip.scrollLeft + 8) strip.scrollLeft = Math.max(0, left - 16);
    else if (right > strip.scrollLeft + strip.clientWidth - 8) strip.scrollLeft = right - strip.clientWidth + 16;
  }, [value]);

  const onKeyDown = (e) => {
    const at = stages.findIndex((s) => s.key === value);
    let next = null;
    if (e.key === "ArrowRight") next = (at + 1) % stages.length;
    else if (e.key === "ArrowLeft") next = (at - 1 + stages.length) % stages.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = stages.length - 1;
    if (next === null) return;
    e.preventDefault();
    const key = stages[next].key;
    onChange(key);
    stripRef.current?.querySelector(`[data-tab="${key}"]`)?.focus();
  };

  return (
    <div ref={stripRef} role="tablist" aria-label="Stages" onKeyDown={onKeyDown} className={SCROLL_CLASS}
      style={{ position: "relative", display: "flex", gap: 8, overflowX: "auto", overscrollBehaviorX: "contain", padding: "4px 2px 10px",
        margin: "0 -2px", maxWidth: "calc(100% + 4px)", boxSizing: "border-box" }}>
      {stages.map((s) => {
        const on = s.key === value;
        const n = counts[s.key] || 0;
        return (
          <button key={s.key} id={tabId(s.key)} data-tab={s.key} type="button" role="tab" aria-selected={on}
            aria-controls={PANEL_ID} tabIndex={on ? 0 : -1} className={FOCUS_CLASS} onClick={() => onChange(s.key)}
            style={{ flexShrink: 0, minHeight: 44, padding: "0 14px", display: "inline-flex", alignItems: "center", gap: 8,
              borderRadius: RADIUS.pill, border: `1.5px solid ${on ? ink.button.bg : BORDER}`,
              background: on ? ink.button.bg : WHITE, color: on ? ink.button.fg : TEXT_MID, fontFamily: SANS,
              fontSize: "0.95rem", fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer" }}>
            {s.label}
            <span aria-hidden="true" style={{ minWidth: 22, height: 22, padding: "0 6px", boxSizing: "border-box",
              display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: RADIUS.pill,
              // A darker pill under a white label, a lighter one under dark ink,
              // so the count keeps its contrast on any accent.
              background: !on ? "rgba(20,20,19,0.07)" : ink.button.fg === WHITE ? "rgba(20,20,19,0.24)" : "rgba(255,255,255,0.45)",
              color: on ? ink.button.fg : TEXT,
              fontSize: "0.9rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
              {n}
            </span>
            <span style={SR_ONLY}>, {n} {n === 1 ? "card" : "cards"}</span>
          </button>
        );
      })}
    </div>
  );
}
