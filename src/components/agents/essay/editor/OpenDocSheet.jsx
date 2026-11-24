import { useEffect, useId, useRef, useState } from "react";
import AgentScreen from "../../screen/AgentScreen.jsx";
import { DOC_FILE_MESSAGES, readDocFile } from "../../screen/docFile.js";
import { Button, ChoiceChips, INPUT_CLASS, Notice, SR_ONLY, Sheet, inputStyle, tabPanelProps } from "../../../ui/kit.jsx";
import { SANS, TEXT, TEXT_MID, TEXT_MUTED } from "../../../ui/tokens.js";

// Bringing a draft in from Google Docs or Word. Quill opens the doc on its
// screen first, so the student sees exactly what came in before anything in
// their draft changes, and the words only move when they press the button
// that says so. A Word file is read here in the browser and never leaves it;
// a Google Doc is fetched by the backend from Google's own export (it must be
// shared as "anyone with the link"), handed back, and not stored.
//
// The words are the student's own, so this is not Quill writing: the promise
// that Quill never writes in an essay holds. What the draft held before is
// saved as a version first (the page's onUse does that), so nothing is lost.
//
// Flow: pick where the essay is, open it, look at it on Quill's screen, then
// use it or cancel. Once a doc is open the form folds to one line ("Open a
// different doc") and focus moves to the choice. A polite status says each
// step to screen readers; an error is said by its alert.

const SOURCES = [
  { key: "google", label: "Google Docs" },
  { key: "word", label: "Word file" },
];
const GOOGLE_LINK = /^(https?:\/\/)?docs\.google\.com\/document\/(u\/\d+\/)?d\/[A-Za-z0-9_-]{20,}([/?#]\S*)?$/i;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default function OpenDocSheet({ onClose, onUse, hasWords, openGoogleDoc, isMobile }) {
  const [source, setSource] = useState("google");
  const [link, setLink] = useState("");
  const [shots, setShots] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [using, setUsing] = useState(false);
  const [status, setStatus] = useState("");
  const fileRef = useRef(null);
  const primaryRef = useRef(null);         // the primary button once a doc is open
  const linkRef = useRef(null);
  const pickRef = useRef(null);
  const refocus = useRef(false);        // "Open a different doc" was pressed: focus goes back to the form
  const ids = useId();
  const linkId = `${ids}-link`;
  const hintId = `${ids}-hint`;
  const errorId = `${ids}-error`;
  const doc = shots[0]?.status === "done" ? shots[0] : null;
  const words = doc ? doc.text.split(/\s+/).filter(Boolean).length : 0;

  // A doc that just opened: bring the choice into view and focus its button.
  // Back to the form after "Open a different doc": focus its field or button.
  useEffect(() => {
    if (doc) {
      // Focus goes to the doc itself (to read it), never to the button that
      // replaces the draft, so a stray Enter can't. The button is brought into view.
      primaryRef.current?.scrollIntoView({ block: "nearest" });
      document.querySelector(`[data-doc-screen="${ids}"] [role=region]`)?.focus({ preventScroll: true });
    } else if (refocus.current) {
      refocus.current = false;
      (source === "google" ? linkRef.current : pickRef.current)?.focus();
    }
  }, [doc?.text]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (shot) => { setError(null); setBusy(true); setStatus("Quill is opening your doc."); setShots([shot]); };
  const opened = (got) => {
    setShots([{ id: "doc", kind: "doc", status: "done", seq: 1, source: got.source, title: got.title || "",
      url: got.url || "", fileName: got.fileName || "", text: got.text }]);
    const n = got.text.split(/\s+/).filter(Boolean).length;
    setStatus(`Opened ${got.title ? `"${got.title}"` : "your doc"}, ${plural(n, "word")}.`);
  };
  const failed = (message) => {
    setShots((s) => s.map((x) => ({ ...x, status: "failed" })));
    setError(message);
    setStatus("");
  };

  const openLink = async (e) => {
    e.preventDefault();
    const value = link.trim();
    if (!GOOGLE_LINK.test(value)) {
      setError(/docs\.google\.com\/document/i.test(value)
        ? "That link looks cut off. In Google Docs, press Share, then Copy link, and paste it here again."
        : "That isn't a Google Docs link. In Google Docs, press Share, then Copy link, and paste it here.");
      linkRef.current?.focus();
      return;
    }
    start({ id: "doc", kind: "doc", status: "active", seq: 1, source: "google", title: "", text: "",
      url: value.startsWith("http") ? value : `https://${value}`, fileName: "" });
    try {
      opened(await openGoogleDoc(value));
    } catch (err) {
      failed(err?.message || "Quill couldn't open that doc just now. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    start({ id: "doc", kind: "doc", status: "active", seq: 1, source: "word", title: "", text: "", url: "", fileName: file.name });
    try {
      opened(await readDocFile(file));
    } catch (err) {
      failed(err?.message || DOC_FILE_MESSAGES.unreadable);
    } finally {
      setBusy(false);
    }
  };

  const again = () => { refocus.current = true; setShots([]); setError(null); setStatus(""); };   // the link stays, to fix or replace

  const use = async () => {
    if (!doc) return;
    setUsing(true);
    setError(null);
    try {
      await onUse(doc.text);
    } catch (err) {
      setError(err?.message || "Couldn't put those words in your draft. Nothing was changed.");
      setUsing(false);
    }
  };

  return (
    <Sheet onClose={onClose} locked={using} labelledBy={`${ids}-title`} width={720}>
      <h2 id={`${ids}-title`} style={{ margin: "0 0 6px", fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
        lineHeight: 1.3 }}>
        Open your doc
      </h2>
      <p style={{ margin: "0 0 16px", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.55,
        maxWidth: "62ch" }}>
        Writing in Google Docs or Word? Quill opens it here so you can check it's the right one. Nothing in your draft
        changes until you say so.
      </p>

      <p role="status" style={SR_ONLY}>{status}</p>

      {doc ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 10px", marginBottom: 12 }}>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT, lineHeight: 1.5 }}>
            {doc.source === "google" ? "From Google Docs" : doc.fileName || "From your computer"}
          </p>
          <Button kind="quiet" disabled={using} onClick={again} style={{ padding: "8px 10px" }}>Open a different doc</Button>
        </div>
      ) : (
        <>
          <ChoiceChips label="Where your essay is" options={SOURCES} value={source} isMobile={isMobile} tabs={ids}
            onChange={(k) => { setSource(k); setError(null); }} />

          <div {...tabPanelProps(ids, source)} style={{ marginTop: 14 }}>
            {source === "google" ? (
              <form onSubmit={openLink} noValidate style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label htmlFor={linkId} style={{ fontFamily: SANS, fontWeight: 700, fontSize: "1rem", color: TEXT }}>
                  Link to your Google Doc
                </label>
                <p id={hintId} style={{ margin: "0 0 4px", fontFamily: SANS, fontSize: "0.95rem", fontWeight: 500, color: TEXT_MUTED,
                  lineHeight: 1.5 }}>
                  In Google Docs, press Share, set General access to &ldquo;Anyone with the link&rdquo;, then Copy link. Once
                  Quill has opened it you can set it back to Restricted; Quill doesn't keep a copy.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <input id={linkId} type="url" data-autofocus inputMode="url" autoComplete="off" spellCheck={false} value={link}
                    ref={linkRef} aria-describedby={error ? `${hintId} ${errorId}` : hintId} aria-invalid={error ? true : undefined}
                    onChange={(e) => { setLink(e.target.value); if (error) setError(null); }}
                    placeholder="docs.google.com/document/d/..."
                    className={INPUT_CLASS} style={{ ...inputStyle, flex: "1 1 260px", minWidth: 0 }} disabled={busy} />
                  <Button kind="primary" type="submit" busy={busy} disabled={!link.trim()}>Open doc</Button>
                </div>
              </form>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
                <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.5 }}>
                  Pick a Word file (.docx) or a plain text file. It's read right here in your browser and never uploaded.
                </p>
                <input ref={fileRef} type="file" accept=".docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={openFile} style={{ display: "none" }} tabIndex={-1} aria-hidden="true" />
                <Button kind="primary" ref={pickRef} busy={busy} onClick={() => fileRef.current?.click()}>Choose a file</Button>
              </div>
            )}
          </div>
        </>
      )}

      {error && <div role="alert" id={errorId} style={{ marginTop: 14 }}><Notice tone="error">{error}</Notice></div>}

      {shots.length > 0 && (
        <div data-doc-screen={ids}>
        <AgentScreen shots={shots} agent="quill" mode="doc" mascot running={busy} isMobile={isMobile}
          height={isMobile ? 240 : 300} style={{ marginTop: 16 }} />
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {doc && (
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.5, maxWidth: "62ch" }}>
            {plural(words, "word")}.{" "}
            {hasWords
              ? "These replace what's in your draft now. Your current words are saved as a version first, so you can get them back."
              : "They go into your draft as they are, and you keep writing from there."}
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {doc && (
            <Button kind="primary" ref={primaryRef} busy={using} onClick={use}>
              {hasWords ? "Replace my draft with these words" : "Use these words"}
            </Button>
          )}
          <Button kind="secondary" disabled={using} onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Sheet>
  );
}
