import { PixelStamp } from "../../../ui/PixelIcons.jsx";
import { RADIUS, SANS, TEXT, WHITE, useAgentInk } from "../../../ui/tokens.js";
import { Button } from "../../../ui/kit.jsx";
import { QUILL_LINES } from "../../../../lib/agents/registry.js";
import { QuillLine } from "./homeParts.jsx";

// The first thing under the night scene when there is no essay yet: the
// invitation to start one, to find ideas, or to talk one through.

/**
 * The desk with no essay yet: start one, or find what to write about.
 */
export function DeskInvitation({ onNew, onFindIdeas, onBrainstorm }) {
  const ink = useAgentInk();
  return (
    <section aria-labelledby="eq-desk-invite"
      style={{ marginTop: 18, padding: "20px", background: WHITE, border: `1.5px solid ${ink.ring}`, borderRadius: RADIUS.card,
        boxSizing: "border-box" }}>
      <h2 id="eq-desk-invite" style={{ margin: 0, fontFamily: SANS, fontSize: "1.4rem", fontWeight: 800, color: TEXT,
        letterSpacing: "-0.01em", lineHeight: 1.25 }}>
        A blank page is a fine place to start
      </h2>
      <QuillLine style={{ marginTop: 6 }}>{QUILL_LINES.essaysEmpty}</QuillLine>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <Button kind="primary" onClick={onNew} style={{ minHeight: 48, padding: "0 22px", fontWeight: 800 }}>
          <PixelStamp kind="sparkle" size={16} />
          New essay
        </Button>
        <Button onClick={onFindIdeas}>
          <PixelStamp kind="star" size={16} />
          Find ideas
        </Button>
        <Button onClick={onBrainstorm}>
          <PixelStamp kind="chat" size={16} />
          Brainstorm with Quill
        </Button>
      </div>
    </section>
  );
}
