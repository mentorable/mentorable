import { useRef } from "react";
import { BORDER, FOCUS_CLASS, SANS, TEXT_MID, WHITE, useAgentInk } from "../../../ui/tokens.js";

// The desk's two-tab switch (Essays | Ideas). A real tablist: the arrow keys,
// Home and End move between tabs, and only the chosen tab is in the tab order.
// The panels stay mounted (the page hides the one not chosen) so nothing a
// student has typed in a card is lost by looking at the other tab.

export const tabId = (prefix, key) => `${prefix}-tab-${key}`;
export const panelId = (prefix, key) => `${prefix}-panel-${key}`;

/**
 * tabs: [{ key, label }]. value: the chosen key. onChange(key).
 * prefix: ids for the tabs and panels (tabId / panelId build the same ones).
 */
export default function DeskTabs({ tabs, value, onChange, prefix, label = "Your desk" }) {
  const ink = useAgentInk();
  const refs = useRef({});

  const onKeyDown = (e) => {
    const at = tabs.findIndex((t) => t.key === value);
    let next = -1;
    if (e.key === "ArrowRight") next = (at + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (at - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].key);
    refs.current[tabs[next].key]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button key={t.key} ref={(n) => { refs.current[t.key] = n; }} type="button" role="tab" id={tabId(prefix, t.key)}
            className={FOCUS_CLASS} aria-selected={on} aria-controls={panelId(prefix, t.key)} tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.key)}
            style={{ display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 16px", borderRadius: 999,
              boxSizing: "border-box", fontFamily: SANS, fontSize: "1rem", fontWeight: on ? 800 : 700, cursor: "pointer",
              border: `1.5px solid ${on ? ink.text : BORDER}`, background: on ? ink.softer : WHITE,
              color: on ? ink.onSoft : TEXT_MID }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
