import { useEffect, useRef, useState } from "react";
import { PixelStamp } from "../PixelIcons.jsx";
import {
  BORDER, FOCUS_CLASS, RADIUS, SANS, SURFACE, TEXT, TEXT_FAINT, TEXT_MID, TEXT_MUTED, WHITE, useAgentInk,
} from "../agentUi.js";
import { FLASH_CLASS, Heading, SR_ONLY, SourceLink, domainOf } from "./flowUi.jsx";

// Beside the draft (under it on a phone): every fact the email states about
// the recipient, each with the page it came from, then the other pages
// Beaker read. Clicking a fact finds it in the email; clicking inside a
// highlighted fact in the email lights up its entry here. A fact whose words
// were edited out of the email stays listed, marked "edited out". Once the
// email is sent there is nothing left to check or find: the rail just says
// where the facts in it came from, and leaves out the ones it never said.

function titleFor(url, sources) {
  const s = (sources || []).find((x) => x?.url === url);
  return s?.title || "";
}

function FactItem({ claim, index, found, sent, active, flash, onSelect, sources, register }) {
  const ink = useAgentInk();
  const title = titleFor(claim.source_url, sources);
  return (
    <li ref={(n) => register(index, n)} key={flash ? `f-${flash}` : "f"} className={flash ? FLASH_CLASS : undefined}
      style={{ listStyle: "none", borderRadius: RADIUS.control, background: active ? ink.softer : WHITE,
        border: `1.5px solid ${active ? ink.ring : BORDER}`, padding: 2, minWidth: 0 }}>
      {sent ? (
        <p style={{ margin: 0, padding: "8px 10px", fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600, color: TEXT,
          lineHeight: 1.5, overflowWrap: "anywhere" }}>
          &ldquo;{claim.text}&rdquo;
        </p>
      ) : found ? (
        <button type="button" className={FOCUS_CLASS} onClick={() => onSelect(index)}
          style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer",
            padding: "8px 10px", borderRadius: RADIUS.control - 2, fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600,
            color: TEXT, lineHeight: 1.5, minHeight: 44, overflowWrap: "anywhere" }}>
          <span style={SR_ONLY}>Find in your email: </span>
          &ldquo;{claim.text}&rdquo;
        </button>
      ) : (
        <div style={{ padding: "8px 10px" }}>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.98rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5,
            textDecoration: "line-through", textDecorationColor: TEXT_FAINT, overflowWrap: "anywhere" }}>
            &ldquo;{claim.text}&rdquo;
          </p>
          <span style={{ display: "inline-block", marginTop: 4, fontFamily: SANS, fontSize: "0.9rem", fontWeight: 700,
            color: TEXT_MUTED, background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: RADIUS.pill, padding: "2px 10px" }}>
            Edited out
          </span>
        </div>
      )}
      <p style={{ margin: 0, padding: "0 10px 8px", fontFamily: SANS, fontSize: "0.93rem", color: TEXT_MUTED, lineHeight: 1.45 }}>
        Source:{" "}
        <SourceLink url={claim.source_url}>{title ? `${title} (${domainOf(claim.source_url)})` : undefined}</SourceLink>
      </p>
    </li>
  );
}

/**
 * claims: [{ text, source_url }]. missing: indexes whose words are gone from
 * the body. activeIndex / onSelect(index): the link with the editor.
 * flashRequest: { index, nonce } flashes an entry (the editor's caret found
 * it). sent: the email has gone, so there is no editor to link with.
 *
 * Only the rail's own scroll box ever moves to show an entry: the sticky
 * column beside the email, marked `data-rail-scroll` by the page. Where the
 * rail sits under the email (a phone, a narrow window) the page stays put,
 * since scrolling it down to the rail would pull away the text being edited.
 */
export default function SourceRail({
  claims = [], missing = [], sources = [], activeIndex = null, onSelect, flashRequest, emailSourceUrl, name, sent = false,
}) {
  const ink = useAgentInk();
  const items = useRef(new Map());
  const [flash, setFlash] = useState(null);
  const register = (i, n) => { if (n) items.current.set(i, n); else items.current.delete(i); };

  useEffect(() => {
    if (!flashRequest) return;
    const n = items.current.get(flashRequest.index);
    const box = n?.closest?.("[data-rail-scroll]");
    if (n && box) {
      const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const b = box.getBoundingClientRect();
      const r = n.getBoundingClientRect();
      const by = r.top < b.top ? r.top - b.top - 8 : r.bottom > b.bottom ? r.bottom - b.bottom + 8 : 0;
      if (by) box.scrollBy?.({ top: by, behavior: reduce ? "auto" : "smooth" });
    }
    setFlash(flashRequest);
  }, [flashRequest]);

  const gone = new Set(missing);
  const shown = claims.map((c, i) => ({ c, i })).filter(({ i }) => !(sent && gone.has(i)));
  const cited = new Set(claims.map((c) => c?.source_url).filter(Boolean));
  const others = (sources || []).filter((s) => s?.url && !cited.has(s.url) && s.url !== emailSourceUrl);

  let intro;
  if (sent) {
    intro = shown.length
      ? "These are the pages the facts in your email came from."
      : "These are the pages Beaker read for this email.";
  } else {
    intro = claims.length
      ? `Every fact about ${name || "them"} in your email comes from one of these pages. Open each one and check it before you send.`
      : "Beaker didn't state any facts about them that need a source. The pages it read are below.";
  }

  return (
    <section aria-labelledby="oa-rail-title" style={{ fontFamily: SANS, minWidth: 0 }}>
      <Heading id="oa-rail-title" level={2} style={{ fontSize: "1.15rem" }}>Sources</Heading>
      <p style={{ margin: "4px 0 12px", fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.55 }}>{intro}</p>

      {shown.length > 0 && (
        <>
          <h3 style={{ margin: "0 0 8px", fontSize: "0.95rem", fontWeight: 800, color: TEXT_MUTED, display: "flex",
            alignItems: "center", gap: 8 }}>
            <span style={{ color: ink.text, display: "flex" }}><PixelStamp kind="sparkle" size={16} /></span>
            Facts in your email
          </h3>
          <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {shown.map(({ c, i }) => (
              <FactItem key={`${i}-${c.text}`} claim={c} index={i} found={!gone.has(i)} sent={sent}
                active={!sent && activeIndex === i} flash={flash && flash.index === i ? flash.nonce : null}
                onSelect={onSelect} sources={sources} register={register} />
            ))}
          </ul>
        </>
      )}

      {emailSourceUrl && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: "0.95rem", fontWeight: 800, color: TEXT_MUTED }}>Where the address came from</h3>
          <p style={{ margin: 0, fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.5 }}>
            <SourceLink url={emailSourceUrl}>{titleFor(emailSourceUrl, sources) || undefined}</SourceLink>
          </p>
        </div>
      )}

      {others.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: "0.95rem", fontWeight: 800, color: TEXT_MUTED }}>Other pages Beaker read</h3>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {others.map((s) => (
              <li key={s.url} style={{ fontSize: "0.95rem", color: TEXT_MID, lineHeight: 1.5, overflowWrap: "anywhere" }}>
                <SourceLink url={s.url}>{s.title ? `${s.title} (${s.domain || domainOf(s.url)})` : undefined}</SourceLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
