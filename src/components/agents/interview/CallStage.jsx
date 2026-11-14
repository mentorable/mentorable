import { useEffect, useId, useRef, useState } from "react";
import { POISE_LINES } from "../../../lib/agents/registry.js";
import { useIsMobile } from "../../../hooks/useIsMobile.js";
import Spinner from "../../common/Spinner.jsx";
import { Button, Card, LinkButton, SR_ONLY, textOnPage } from "../../ui/kit.jsx";
import { PixelStamp } from "../../ui/PixelIcons.jsx";
import {
  AMBER_BG, AMBER_EDGE, AMBER_LINE, AMBER_TEXT, BORDER, FOCUS_CLASS, RADIUS, SANS, TEXT, TEXT_MID, useAgentInk,
} from "../../ui/tokens.js";
import Mascot from "../Mascot.jsx";
import { MARSH_SCENE, PoiseSays } from "./MarshScene.jsx";
import { END_CONFIRM_SECONDS, MAX_SECONDS, POISE, WARN_SECONDS, clock, clockWords } from "./interviewUi.js";

// The call itself, as a quiet room: the marsh fills the screen with Poise
// large in the middle, listening or talking. Little to read: the time sits
// in a small tag in the corner and a thin bar along the water, captions (off
// until the student turns them on) are one subtitle line in the sky, and
// under the stage there is only whose turn it is, the captions switch and a
// plain End.
//
// Nothing here judges an answer: Poise never says how the student is doing
// during the call. At the one-minute mark the time tag and the bar turn
// amber and Poise's warning appears under the stage (said to screen readers
// once), and the page ends the call at the cap.
//
// Hanging up in the first minute asks first, since a mock that has run is
// spent. The phases before and after the call proper ("mic", "connecting",
// "ending") use the same stage, so the student's eye never has to move.

const SCORING_EVERY_MS = 4500;

// A subtitle shows the end of a long line, the part just said.
const CAPTION_CHARS = { wide: 240, narrow: 110 };

const STAGE = {
  wide: { height: 430, heron: 256, bar: 8 },
  narrow: { height: 340, heron: 160, bar: 6 },
};

// Overlays on the sky: dark enough that white text reads on every band of it.
const SUBTITLE_BG = "rgba(20,20,19,0.82)";
const WATER_SHADE = "rgba(20,20,19,0.45)";
const BAR_TRACK = "rgba(255,255,255,0.35)";
const BAR_FILL = "rgba(255,255,255,0.9)";
const BAR_FILL_WARN = "#f3c26b";

/** The end of a long caption, cut at a word, so a subtitle stays a line or
 *  two. The whole line still reaches screen readers. */
function tailOf(text, n) {
  if (text.length <= n) return text;
  const cut = text.slice(-n);
  const space = cut.indexOf(" ");
  return `…${space > 0 && space < 30 ? cut.slice(space + 1) : cut}`;
}

/**
 * The marsh with Poise in it. Every drawn thing is decoration (aria-hidden);
 * `children` are the overlays that carry words (the time, the subtitle).
 * `fill`: the share of the call gone, drawn as a bar along the water, or null.
 */
function Room({ height, heronSize, state, isMobile, heron = true, fill = null, warned = false, barH = 8, children }) {
  const { sky, ground, Decor } = MARSH_SCENE;
  const px = isMobile ? 3 : 4;
  const groundH = isMobile ? ground.mobileH : ground.h;
  return (
    <div style={{ position: "relative", height, borderRadius: RADIUS.card, overflow: "hidden", background: sky,
      boxSizing: "border-box" }}>
      <div aria-hidden="true">
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: groundH, boxSizing: "border-box",
          background: ground.color, borderTop: `4px solid ${ground.top}` }} />
        <Decor px={px} groundH={groundH} isMobile={isMobile} />
        {fill != null && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: groundH, display: "flex",
            alignItems: "center", padding: "0 14px", background: WATER_SHADE, boxSizing: "border-box" }}>
            <span style={{ flex: 1, height: barH, background: BAR_TRACK, borderRadius: 4, overflow: "hidden", display: "block" }}>
              <span style={{ display: "block", height: "100%", width: `${Math.round(Math.min(1, Math.max(0, fill)) * 1000) / 10}%`,
                background: warned ? BAR_FILL_WARN : BAR_FILL }} />
            </span>
          </div>
        )}
        {heron && (
          <div style={{ position: "absolute", left: "50%", bottom: groundH - 6, transform: "translateX(-50%) scaleX(-1)" }}>
            <Mascot agent={POISE} state={state} size={heronSize} title="" />
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/** A short strip of the same marsh, for the screens around the call (the
 *  microphone help, the wait, a refusal), so they sit in the same room.
 *  Decoration only. `heron`: false where Poise already appears below. */
export function CallRoomStrip({ heron = true, style }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ marginBottom: 16, ...style }}>
      <Room height={isMobile ? 110 : 150} heronSize={isMobile ? 96 : 128} state="idle" isMobile={isMobile} heron={heron} />
    </div>
  );
}

/** Poise's "reading your answers" lines, one at a time. Flavour only: the
 *  one thing announced is that Poise is reading. */
function Reading() {
  const scoring = Array.isArray(POISE_LINES?.scoring) ? POISE_LINES.scoring : [];
  const lines = [POISE_LINES?.ending, ...scoring].filter((l) => typeof l === "string" && l);
  if (!lines.length) lines.push("Reading your answers.");
  const [at, setAt] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAt((n) => (n + 1) % lines.length), SCORING_EVERY_MS);
    return () => clearInterval(t);
  }, [lines.length]);
  return <span aria-hidden="true">{lines[at]}</span>;
}

/** The captions as one subtitle line in the sky: the latest thing said, and
 *  who said it, in words. What came before is not shown. */
function CallCaption({ id, caption, isMobile }) {
  const who = caption ? (caption.who === "student" ? "You" : "Poise") : null;
  return (
    <div id={id} role="log" aria-live="polite" aria-label="Live captions"
      style={{ position: "absolute", zIndex: 2, left: "50%", transform: "translateX(-50%)", top: isMobile ? 58 : 72,
        width: isMobile ? "calc(100% - 24px)" : "min(640px, 90%)", boxSizing: "border-box", background: SUBTITLE_BG,
        color: "#ffffff", borderRadius: 10, padding: "10px 14px", fontFamily: SANS, fontSize: isMobile ? "1rem" : "1.05rem",
        fontWeight: 600, lineHeight: 1.5, textAlign: "center", overflowWrap: "anywhere" }}>
      {caption ? (
        <p key={caption.at} style={{ margin: 0 }}>
          <b style={{ fontWeight: 800 }}>{who}: </b>
          <span style={SR_ONLY}>{caption.text}</span>
          <span aria-hidden="true">{tailOf(caption.text, isMobile ? CAPTION_CHARS.narrow : CAPTION_CHARS.wide)}</span>
        </p>
      ) : (
        <p style={{ margin: 0 }}>Captions show here as each of you finishes speaking.</p>
      )}
    </div>
  );
}

/** The time, small in the corner of the sky; amber from the warning mark. */
function CallTime({ seconds, maxSeconds, warnSeconds, warned }) {
  const soon = maxSeconds - warnSeconds === 60 ? "one minute left" : "nearly time";
  return (
    <p role="timer" aria-label={`Time on the call: ${clockWords(seconds)} of ${clockWords(maxSeconds)}`}
      style={{ position: "absolute", zIndex: 3, right: 12, top: 12, maxWidth: "calc(100% - 24px)", margin: 0,
        boxSizing: "border-box", padding: "6px 12px", borderRadius: 10, fontFamily: SANS, fontSize: "1rem", fontWeight: 800,
        lineHeight: 1.4, fontVariantNumeric: "tabular-nums", background: warned ? AMBER_BG : "rgba(255,255,255,0.92)",
        border: `1px solid ${warned ? AMBER_LINE : "transparent"}`, color: warned ? AMBER_TEXT : TEXT }}>
      {clock(seconds)} of {clock(maxSeconds)}{warned ? `, ${soon}` : ""}
    </p>
  );
}

/**
 * phase: "mic" (the browser is asking for the microphone), "connecting",
 * "live", "ending" (the call is over and Poise is reading). seconds: how long
 * the call has run. maxSeconds, warnSeconds: the cap and the warning mark.
 * speaking: Poise is talking right now. captions: [{ who, text }].
 * showCaptions, onToggleCaptions(): the captions switch. onEnd(): hang up
 * (already confirmed when it was early).
 */
export default function CallStage({
  phase, seconds = 0, maxSeconds = MAX_SECONDS, warnSeconds = WARN_SECONDS, speaking = false, captions = [],
  showCaptions = false, onToggleCaptions, onEnd,
}) {
  const ink = useAgentInk();
  const isMobile = useIsMobile();
  const uid = useId();
  const [confirming, setConfirming] = useState(false);
  const keepRef = useRef(null);
  const endRef = useRef(null);
  const wasConfirming = useRef(false);

  const live = phase === "live";
  const ending = phase === "ending";
  const warned = live && seconds >= warnSeconds;
  const left = Math.max(0, maxSeconds - seconds);
  const pose = ending ? "idle" : live ? (speaking ? "talking" : "listening") : "idle";
  const size = isMobile ? STAGE.narrow : STAGE.wide;
  const latest = captions.length ? { ...captions[captions.length - 1], at: captions.length } : null;

  // The confirm takes focus on the safe choice; going back hands it to End again.
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) endRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);
  // Once past the first minute (or off the call) there is nothing to confirm.
  useEffect(() => {
    if (confirming && (!live || seconds >= END_CONFIRM_SECONDS)) setConfirming(false);
  }, [confirming, live, seconds]);

  const pressEnd = () => {
    if (live && seconds < END_CONFIRM_SECONDS) { setConfirming(true); return; }
    onEnd?.();
  };

  // Before and after the call Poise says what is happening; during it the room stays quiet.
  const says = phase === "mic" ? POISE_LINES?.micAsk
    : phase === "connecting" ? POISE_LINES?.connecting
    : ending ? <Reading />
    : null;

  const canEnd = live || phase === "connecting";

  return (
    <section aria-labelledby={`${uid}-title`} style={{ minWidth: 0 }}>
      <h2 id={`${uid}-title`} style={SR_ONLY}>
        {ending ? "The call has ended" : live ? "The interview is on" : "Getting the call ready"}
      </h2>

      <Room height={size.height} heronSize={size.heron} state={pose} isMobile={isMobile}
        fill={live ? seconds / Math.max(1, maxSeconds) : null} warned={warned} barH={size.bar}>
        {live && <CallTime seconds={seconds} maxSeconds={maxSeconds} warnSeconds={warnSeconds} warned={warned} />}
        {live && showCaptions && <CallCaption id={`${uid}-captions`} caption={latest} isMobile={isMobile} />}
      </Room>

      {says && <PoiseSays center="middle">{says}</PoiseSays>}

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between",
        gap: "10px 16px", marginTop: 16 }}>
        {live ? (
          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontFamily: SANS, fontSize: "1rem",
            fontWeight: 700, color: speaking ? textOnPage(ink) : TEXT_MID, lineHeight: 1.4, minWidth: 0 }}>
            <span aria-hidden="true" style={{ display: "flex", flexShrink: 0 }}>
              <PixelStamp kind={speaking ? "chat" : "person"} size={16} />
            </span>
            {speaking ? "Poise is speaking" : "Your turn. Take your time."}
          </p>
        ) : (
          <p role="status" style={{ margin: 0, display: "flex", alignItems: "center", gap: 10, fontFamily: SANS,
            fontSize: "1rem", fontWeight: 700, color: TEXT_MID, lineHeight: 1.5, minWidth: 0 }}>
            <Spinner size={18} color={textOnPage(ink)} />
            {phase === "mic" ? "Waiting for your microphone."
              : phase === "connecting" ? "Connecting the call."
              : "Poise is reading your answers. This can take a minute or two."}
          </p>
        )}

        {canEnd && !confirming && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginLeft: "auto", flex: isMobile ? "1 1 100%" : undefined }}>
            {live && (
              <Button kind="secondary" aria-pressed={showCaptions} aria-controls={showCaptions ? `${uid}-captions` : undefined}
                onClick={onToggleCaptions} style={{ flex: isMobile ? "1 1 140px" : undefined }}>
                {showCaptions ? "Hide captions" : "Show captions"}
              </Button>
            )}
            <Button ref={endRef} kind="secondary" onClick={pressEnd}
              style={{ borderColor: TEXT_MID, color: TEXT, flex: isMobile ? "1 1 140px" : undefined }}>
              {live ? "End interview" : "Cancel"}
            </Button>
          </div>
        )}
      </div>

      {canEnd && confirming && (
        <Card role="group" aria-labelledby={`${uid}-confirm`} style={{ marginTop: 14 }}>
          <p id={`${uid}-confirm`} style={{ margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 700, color: TEXT,
            lineHeight: 1.5 }}>
            End the interview already? It has only just started, and a mock that has run counts as one of yours.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            <Button ref={keepRef} kind="primary" onClick={() => setConfirming(false)} style={{ flex: "1 1 160px" }}>
              Keep going
            </Button>
            <Button kind="secondary" onClick={() => { setConfirming(false); onEnd?.(); }} style={{ flex: "1 1 160px" }}>
              End it now
            </Button>
          </div>
        </Card>
      )}

      {/* Always in the page while the call is on, so the warning is announced the moment it appears. */}
      <div aria-live="polite">
        {warned && (
          <p style={{ margin: "14px 0 0", padding: "10px 14px", background: AMBER_BG, border: `1px solid ${AMBER_LINE}`,
            borderLeft: `4px solid ${AMBER_EDGE}`, borderRadius: RADIUS.control, fontFamily: SANS, fontSize: "1rem",
            fontWeight: 700, color: AMBER_TEXT, lineHeight: 1.5 }}>
            {POISE_LINES?.warnMinute}
            <span style={SR_ONLY}> {clockWords(left)} left.</span>
          </p>
        )}
      </div>
    </section>
  );
}

// ── Shared by the three pages ────────────────────────────────────────────────

/**
 * What else to know about the microphone, under Poise's micDenied line (or
 * in its place, when there is no microphone to allow). `reason`: "denied",
 * "missing" or "unsupported", from micCheck.
 */
export function MicHelp({ reason = "denied", style }) {
  const text = { margin: 0, fontFamily: SANS, fontSize: "1rem", fontWeight: 500, color: TEXT_MID, lineHeight: 1.6 };
  if (reason === "missing") {
    return (
      <div style={style}>
        <p style={text}>
          Your browser can&apos;t find a microphone. Plug one in, or use a device that has one, then try again.
        </p>
      </div>
    );
  }
  if (reason === "unsupported") {
    return (
      <div style={style}>
        <p style={text}>
          This browser can&apos;t use a microphone here. Try a current version of Chrome, Edge, Firefox or Safari.
        </p>
      </div>
    );
  }
  // Poise's own line (micDenied) already says where the setting is; this adds what it can't.
  return (
    <div style={style}>
      <p style={text}>
        On a school device, an administrator may have turned the microphone off. Poise needs it, so ask them or use
        another device.
      </p>
    </div>
  );
}

/**
 * The hand-off: what to do when someone may be in danger, said calmly, and
 * nothing else of the interview around it. `message`: the server's words.
 * `headingRef`: for the page to focus. `onHome()`: the way back.
 */
export function HandoffPanel({ message, headingRef, onHome, level = 2 }) {
  const ink = useAgentInk();
  const H = level === 1 ? "h1" : "h2";
  return (
    <Card as="section" aria-labelledby="pi-handoff-title"
      style={{ maxWidth: 640, borderStyle: "solid", borderWidth: "1px 1px 1px 4px", borderColor: `${BORDER} ${BORDER} ${BORDER} ${ink.ring}` }}>
      <H id="pi-handoff-title" ref={headingRef} tabIndex={-1} className={FOCUS_CLASS}
        style={{ margin: 0, fontFamily: SANS, fontSize: "1.2rem", fontWeight: 800, color: TEXT, borderRadius: 6 }}>
        A note from Poise
      </H>
      <p style={{ margin: "10px 0 0", fontFamily: SANS, fontSize: "1.05rem", fontWeight: 500, color: TEXT, lineHeight: 1.65,
        overflowWrap: "anywhere" }}>
        {message || POISE_LINES?.handoffNote}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        <LinkButton href="tel:988">Call 988</LinkButton>
        <LinkButton href="sms:988">Text 988</LinkButton>
        {onHome && <Button kind="quiet" onClick={onHome}>Back to Poise</Button>}
      </div>
    </Card>
  );
}
