import { useId, useRef, useState } from "react";
import AgentScreen from "../../screen/AgentScreen.jsx";
import { DOC_FILE_MESSAGES, readDocFile } from "../../screen/docFile.js";
import { Button, ChoiceChips, FieldLabel, INPUT_CLASS, Notice, Sheet, inputStyle, tabPanelProps } from "../../../ui/kit.jsx";
import { SANS, TEXT, TEXT_MID, TEXT_MUTED } from "../../../ui/tokens.js";

// Bringing a draft in from Google Docs or Word. Quill opens the doc on its
// screen first, so the student sees exactly what came in before anything in
// their draft changes, and the words only move when they press "Use these
// words". A Word file is read here in the browser and never leaves it; a
// Google Doc is fetched by the backend from Google's own export (it must be
// shared as "anyone with the link"), handed back, and not stored.
//
// The words are the student's own, so this is not Quill writing: the promise
// that Quill never writes in an essay holds. What the draft held before is
// saved as a version first (the page's onUse does that), so nothing is lost.

const SOURCES = [
  { key: "google", label: "Google Docs" },
  { key: "word", label: "Word file" },
];
const GOOGLE_LINK = /^(https?:\/\/)?docs\.google\.com\/document\/(u\/\d+\/)?d\/[A-Za-z0-9_-]{20,}/i;

export default function OpenDocSheet({ onClose, onUse, hasWords, openGoogleDoc, isMobile }) {
  const [source, setSource] = useState("google");
  const [link, setLink] = useState("");
  const [shots, setShots] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [using, setUsing] = useState(false);
  const fileRef = useRef(null);
  const linkId = useId();
  const base = useId();
  const doc = shots[0]?.status === "done" ? shots[0] : null;

  const opened = (got) => setShots([{ id: "doc", kind: "doc", status: "done", seq: 1, source: got.source, title: got.title || "",
    url: got.url || "", fileName: got.fileName || "", text: got.text }]);
  const failed = () => setShots((s) => s.map((x) => ({ ...x, status: "failed" })));

  const openLink = async (e) => {
    e.preventDefault();
    setError(null);
    const value = link.trim();
    if (!GOOGLE_LINK.test(value)) {
      setError("That doesn't look like a Google Docs link. Open the doc and copy the address from the top of the browser.");
      return;
    }
    setBusy(true);
    setShots([{ id: "doc", kind: "doc", status: "active", seq: 1, source: "google", title: "", text: "",
      url: value.startsWith("http") ? value : `https://${value}`, fileName: "" }]);
    try {
      opened(await openGoogleDoc(value));
    } catch (err) {
      failed();
      setError(err?.message || "Quill couldn't open that doc just now. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(true);
    setShots([{ id: "doc", kind: "doc", status: "active", seq: 1, source: "word", title: "", text: "", url: "",
      fileName: file.name }]);
    try {
      opened(await readDocFile(file));
    } catch (err) {
      failed();
      setError(err?.message || DOC_FILE_MESSAGES.unreadable);
    } finally {
      setBusy(false);
    }
  };

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

  const words = doc ? doc.text.split(/\s+/).filter(Boolean).length : 0;

  return (
    <Sheet onClose={onClose} locked={using} labelledBy={`${base}-title`} width={720}>
      <h2 id={`${base}-title`} style={{ margin: "0 0 6px", fontFamily: SANS, fontSize: "1.3rem", fontWeight: 800, color: TEXT,
        lineHeight: 1.3 }}>
        Open your doc
      </h2>
      <p style={{ margin: "0 0 16px", fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.55,
        maxWidth: "62ch" }}>
        Writing in Google Docs or Word? Quill opens it here so you can check it's the right one. Nothing in your draft
        changes until you say so.
      </p>

      <ChoiceChips label="Where your essay is" options={SOURCES} value={source} isMobile={isMobile} tabs={base}
        onChange={(k) => { setSource(k); setError(null); }} />

      <div {...tabPanelProps(base, source)} style={{ marginTop: 14 }}>
        {source === "google" ? (
          <form onSubmit={openLink} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <FieldLabel htmlFor={linkId} hint='In Google Docs, press Share, set General access to "Anyone with the link", then Copy link.'>
              Link to your Google Doc
            </FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <input id={linkId} type="url" inputMode="url" autoComplete="off" spellCheck={false} value={link}
                onChange={(e) => setLink(e.target.value)} placeholder="https://docs.google.com/document/d/..."
                className={INPUT_CLASS} style={{ ...inputStyle, flex: "1 1 260px", minWidth: 0 }} disabled={busy || using} />
              <Button kind="primary" type="submit" busy={busy} disabled={using || !link.trim()}>Open doc</Button>
            </div>
          </form>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
            <p style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 600, color: TEXT, lineHeight: 1.5 }}>
              Pick a Word file (.docx). It's read right here in your browser and never uploaded.
            </p>
            <input ref={fileRef} type="file" accept=".docx,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              onChange={openFile} style={{ display: "none" }} tabIndex={-1} aria-hidden="true" />
            <Button kind="primary" busy={busy} disabled={using} onClick={() => fileRef.current?.click()}>Choose a Word file</Button>
          </div>
        )}
      </div>

      {error && <Notice tone="error" style={{ marginTop: 14 }}><span role="alert">{error}</span></Notice>}

      {shots.length > 0 && (
        <AgentScreen shots={shots} agent="quill" running={busy} isMobile={isMobile} height={isMobile ? 260 : 320}
          style={{ marginTop: 16 }} />
      )}

      {doc && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontFamily: SANS, fontSize: "0.95rem", fontWeight: 600, color: TEXT_MUTED, lineHeight: 1.5 }}>
            {words} {words === 1 ? "word" : "words"}.{" "}
            {hasWords
              ? "Using these replaces what's in your draft now. Your current words are saved as a version first, so nothing is lost."
              : "They go into your draft as they are, and you keep writing from there."}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Button kind="primary" busy={using} onClick={use}>Use these words</Button>
            <Button kind="secondary" disabled={using} onClick={onClose}>Cancel</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
