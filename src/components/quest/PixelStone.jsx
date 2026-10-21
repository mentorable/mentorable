// A day on the map as a pixel stone: a stepped disc on a 4px grid, raised by
// one pixel row of its edge colour, with an 8 by 8 picture inside. The picture
// says what kind of work the day's task is (code, research, reading, writing,
// practice, reaching out, testing, data, planning, building, sharing), read
// from its title; a day whose task is not written yet shows a small ring.

export const UNIT = 4;                      // CSS px per pixel, the stamps' own grid at 32px
const PIC = 8;

// "x" is the picture's main tone, "o" its soft tone.
const PICTURES = {
  code: [
    "........",
    "..x.ox..",
    ".x..o.x.",
    "x..o...x",
    ".x.o..x.",
    "..x..x..",
    "........",
    "........",
  ],
  search: [
    ".xxxx...",
    "xo...x..",
    "x....x..",
    "x....x..",
    ".xxxx...",
    ".....xx.",
    "......xx",
    "........",
  ],
  book: [
    "........",
    ".xx..xx.",
    "xooxxoox",
    "xooxxoox",
    "xooxxoox",
    "xxxxxxxx",
    "...xx...",
    "........",
  ],
  pencil: [
    "......xx",
    ".....xxx",
    "....xxx.",
    "...xxx..",
    "..xxx...",
    ".oxx....",
    ".oo.....",
    "o.......",
  ],
  target: [
    "..xxxx..",
    ".x....x.",
    "x..xx..x",
    "x.xoox.x",
    "x.xoox.x",
    "x..xx..x",
    ".x....x.",
    "..xxxx..",
  ],
  chat: [
    "........",
    ".xxxxxx.",
    "xxxxxxxx",
    "xx.xx.xx",
    "xxxxxxxx",
    ".xxxxxx.",
    ".xx.....",
    ".x......",
  ],
  flask: [
    "..xxxx..",
    "...xx...",
    "...xx...",
    "..xxxx..",
    ".xooooo.",
    "xoooooox",
    "xoooooox",
    ".xxxxxx.",
  ],
  chart: [
    "........",
    "......xx",
    "......xx",
    "...xx.xx",
    "...xx.xx",
    "xx.xx.xx",
    "xx.xx.xx",
    "oooooooo",
  ],
  list: [
    "..xxxx..",
    "xxxooxxx",
    "x......x",
    "x.xxxx.x",
    "x......x",
    "x.xxxx.x",
    "x......x",
    "xxxxxxxx",
  ],
  hammer: [
    "xxxxx...",
    "xxxxxx..",
    "xxxxx...",
    "..oo....",
    "...oo...",
    "....oo..",
    ".....oo.",
    "......oo",
  ],
  rocket: [
    "...xx...",
    "..xxxx..",
    "..xoox..",
    "..xxxx..",
    ".xxxxxx.",
    "x.xxxx.x",
    "...oo...",
    "..o..o..",
  ],
  spark: [
    "...x....",
    "...x....",
    "..xxx...",
    "xxxxxxx.",
    "..xxx...",
    "...x....",
    "...x....",
    "........",
  ],
  // A day whose task is not written yet (each day's task is made when it comes).
  upcoming: [
    "........",
    "........",
    "...xx...",
    "..x..x..",
    "..x..x..",
    "...xx...",
    "........",
    "........",
  ],
  star: [
    "...xx...",
    "...xx...",
    "..xxxx..",
    "xxxxxxxx",
    ".xxxxxx.",
    "..xxxx..",
    ".xxxxxx.",
    ".xx..xx.",
  ],
  lock: [
    "..xxxx..",
    ".x....x.",
    ".x....x.",
    "xxxxxxxx",
    "xxx..xxx",
    "xxx..xxx",
    "xxxxxxxx",
    "........",
  ],
};

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
  return "spark";
}

/** A stone's picture: the kind of its task, or "upcoming" before it has one. */
export function pictureFor(stone) {
  return stone?.task?.title ? kindOf(stone.task.title) : "upcoming";
}

// One path per shape: a 1-pixel-tall rectangle per run of cells.
function runs(test, w, h, dx = 0, dy = 0) {
  let d = "";
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      if (!test(x, y)) { x += 1; continue; }
      let end = x;
      while (end < w && test(end, y)) end += 1;
      d += `M${x + dx} ${y + dy}h${end - x}v1h${x - end}z`;
      x = end;
    }
  }
  return d;
}

const CACHE = new Map();
function shapes(n, picture) {
  const key = `${n}:${picture}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const r = n / 2;
  const dist = (x, y) => Math.hypot(x + 0.5 - r, y + 0.5 - r);
  const inDisc = (x, y) => dist(x, y) <= r - 0.15;
  // The outline: a disc cell with any of its eight neighbours outside, so the
  // ring has no gaps where the steps go diagonal.
  const inRing = (x, y) => inDisc(x, y) && [-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => !inDisc(x + dx, y + dy)));
  // A dashed ring: every other run of cells around the edge, by angle.
  const dashed = (x, y) => inRing(x, y)
    && Math.floor(((Math.atan2(y + 0.5 - r, x + 0.5 - r) + Math.PI) / (2 * Math.PI)) * 16) % 2 === 0;
  const grid = PICTURES[picture];
  const off = (n - PIC) / 2;
  const s = {
    disc: runs(inDisc, n, n),
    edge: runs(inDisc, n, n, 0, 1),
    ring: runs(inRing, n, n),
    dashed: runs(dashed, n, n),
    pic: grid ? runs((x, y) => grid[y][x] === "x", PIC, PIC, off, off) : "",
    soft: grid ? runs((x, y) => grid[y][x] === "o", PIC, PIC, off, off) : "",
  };
  CACHE.set(key, s);
  return s;
}

/** `cells`: the disc's width in pixels. `ring`: "solid", "dashed" or none. */
export function PixelStone({ cells, picture, fill, edge, ink, ring, ringColor }) {
  const s = shapes(cells, picture);
  return (
    <svg width={cells * UNIT} height={(cells + 1) * UNIT} viewBox={`0 0 ${cells} ${cells + 1}`}
      shapeRendering="crispEdges" aria-hidden="true" focusable="false" style={{ display: "block" }}>
      <path d={s.edge} fill={edge} />
      <path d={s.disc} fill={fill} />
      {ring && <path d={ring === "dashed" ? s.dashed : s.ring} fill={ringColor} />}
      <path d={s.pic} fill={ink} />
      {s.soft && <path d={s.soft} fill={ink} opacity={0.5} />}
    </svg>
  );
}
