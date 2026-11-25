import { Glyph } from "../ui/Icons.jsx";

// A day on the map as a raised stone: a round disc sitting on a solid lip of
// its edge colour (the Quest page's one bold surface, like its buttons), with
// a line picture inside. The picture says what kind of work the day's task is
// (code, research, reading, writing, practice, reaching out, testing, data,
// planning, building, sharing), read from its title; a day whose task is not
// written yet shows a small ring.

export const LIP = 4;   // px of edge showing under the disc

// What kind of work a task is, read from its title: the first rule whose
// words appear wins, so the more specific kinds come first.
const KINDS = [
  ["code", /\b(code|coding|program|script|function|api|database|deploy|debug|python|java(script)?|html|css|app|website|web ?page|load|import|upload|commit)\b/i],
  ["flask", /\b(test|tests|testing|experiment|try out|trial|measure|verify|check)\b/i],
  ["chart", /\b(data|spreadsheet|chart|graph|analy[sz]e|analysis|numbers|stats|statistics|results)\b/i],
  ["pencil", /\b(write|writing|draft|outline|essay|journal|edit|revise|notes?|blog|caption|summary|summari[sz]e)\b/i],
  ["search", /\b(find|research|look up|search|explore|gather|collect|investigate|compare|scout|list of)\b/i],
  ["book", /\b(read|reading|learn|watch|study|course|tutorial|lesson|chapter|video)\b/i],
  ["target", /\b(practice|practise|solve|problems?|drill|rehearse|exercise|quiz|review|memori[sz]e)\b/i],
  ["chat", /\b(email|ask|reach out|contact|message|call|interview|meet|meeting|talk|survey|mentor|teacher)\b/i],
  ["list", /\b(plan|planning|schedule|organi[sz]e|decide|choose|pick|goals?|checklist|map out|prioriti[sz]e)\b/i],
  ["hammer", /\b(build|make|set up|setup|create|design|prototype|assemble|craft|draw|sketch|paint|add|install|wire)\b/i],
  ["rocket", /\b(share|post|present|presentation|publish|launch|show|demo|submit|send|announce)\b/i],
];

/** The picture for a task title: its kind of work, or a spark for anything else. */
export function kindOf(title) {
  const t = String(title || "");
  for (const [kind, re] of KINDS) if (re.test(t)) return kind;
  return "sparkle";
}

/** A stone's picture: the kind of its task, or "upcoming" before it has one. */
export function pictureFor(stone) {
  return stone?.task?.title ? kindOf(stone.task.title) : "upcoming";
}

/** `size`: the disc's width in px (the stone is LIP px taller). `ring`:
 *  "solid", "dashed" or none, drawn just inside the disc's edge. */
export function QuestStone({ size, picture, fill, edge, ink, ring, ringColor }) {
  const r = size / 2;
  const ringW = Math.max(2.5, Math.round(size / 22));
  const inset = ringW / 2 + Math.max(3, size * 0.06);
  const around = 2 * Math.PI * (r - inset);
  return (
    <span aria-hidden="true" style={{ position: "relative", display: "block", width: size, height: size + LIP }}>
      <svg width={size} height={size + LIP} viewBox={`0 0 ${size} ${size + LIP}`} focusable="false"
        style={{ position: "absolute", inset: 0, display: "block", overflow: "visible" }}>
        <circle cx={r} cy={r + LIP} r={r} fill={edge} />
        <circle cx={r} cy={r} r={r} fill={fill} />
        {ring && (
          <circle cx={r} cy={r} r={r - inset} fill="none" stroke={ringColor} strokeWidth={ringW}
            strokeLinecap="round" strokeDasharray={ring === "dashed" ? `${around / 16 * 0.55} ${around / 16 * 0.45}` : undefined} />
        )}
      </svg>
      <span style={{ position: "absolute", left: 0, top: 0, width: size, height: size, display: "grid", placeItems: "center",
        color: ink }}>
        <Glyph kind={picture} size={Math.round(size * (ring ? 0.4 : 0.44))} />
      </span>
    </span>
  );
}
