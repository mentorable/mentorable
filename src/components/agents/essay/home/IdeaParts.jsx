import { RADIUS, SANS } from "../../../ui/tokens.js";
import { evidenceOf, listOf } from "./homeUi.js";

// Small pieces the idea cards share: where a card came from, the little pill
// that says so, and the one line a compact card shows in a pile.

export const SOURCES = {
  record: { stamp: "scroll", label: "From your record" },
  talk: { stamp: "chat", label: "From a brainstorm" },
  student: { stamp: "sparkle", label: "Your own idea" },
};

export function Tag({ children, style }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: RADIUS.pill,
      fontFamily: SANS, fontSize: "0.9rem", fontWeight: 800, lineHeight: 1.35, maxWidth: "100%", boxSizing: "border-box",
      ...style }}>
      {children}
    </span>
  );
}

/** What a pile card says under its name, as { kind, text, label?, more }:
 *  the first question, else the first thing in the record that points there,
 *  else the start of the student's own notes. */
export function previewOf(topic) {
  const questions = listOf(topic.questions);
  if (questions.length) return { kind: "question", text: questions[0], more: questions.length - 1 };
  const evidence = evidenceOf(topic);
  if (evidence.length) {
    const e = evidence[0];
    return { kind: "evidence", label: e.label, text: e.text, quote: e.quote, more: 0 };
  }
  const notes = (topic.notes || "").split("\n")
    .filter((l) => l.startsWith("You said: ")).map((l) => l.slice(10)).join(" ") || (topic.notes || "");
  const flat = notes.replace(/\s+/g, " ").trim();
  if (flat) return { kind: "notes", text: flat, more: 0 };
  return { kind: "none", text: "", more: 0 };
}

/** What each pile is for, shown when it is empty. */
export const PILE_EMPTY = {
  exploring: "Ideas you are still turning over go here.",
  chosen: "The idea you decide to write about goes here.",
  parked: "Ideas you are putting down for now go here. They stay until you delete them.",
};
