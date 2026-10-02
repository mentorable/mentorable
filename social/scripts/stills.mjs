// Renders several stills of one composition from a single bundle, which is
// much faster than calling `remotion still` once per frame.
//
//   node scripts/stills.mjs Agents001 0 45 89 120            frames by number
//   node scripts/stills.mjs Agents001 hook draft:30 --guides  a scene's middle, or a frame into it
//   node scripts/stills.mjs Agents001 all                    every scene's first, middle and last frame
//
// Writes out/stills/<composition>-<frame>.png and prints each path. --guides
// shows the safe-zone overlay; --out <dir> writes somewhere else.

import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const args = process.argv.slice(2);
const guides = args.includes("--guides");
const outFlag = args.indexOf("--out");
const outDir = path.resolve(root, outFlag >= 0 ? args[outFlag + 1] : "out/stills");
const [id, ...targets] = args.filter((a, i) => !a.startsWith("--") && (outFlag < 0 || i !== outFlag + 1));
if (!id || targets.length === 0) {
  console.error("usage: node scripts/stills.mjs <composition> <frame | scene | scene:offset | all>... [--guides] [--out dir]");
  process.exit(1);
}

async function scenesFor(compId) {
  if (compId !== "Agents001") return null;
  const mod = await import(path.join(root, "src/videos/001-agents/timeline.js"));
  return mod.sceneById;
}

const scenes = await scenesFor(id);
const frames = [];
for (const t of targets) {
  if (/^\d+$/.test(t)) { frames.push(Number(t)); continue; }
  if (!scenes) throw new Error(`"${t}" is not a frame number, and ${id} has no scene table here`);
  if (t === "all") {
    for (const s of Object.values(scenes)) frames.push(s.from + 2, s.from + Math.floor(s.frames / 2), s.from + s.frames - 1);
    continue;
  }
  const [name, off] = t.split(":");
  const s = scenes[name];
  if (!s) throw new Error(`unknown scene "${name}" (have: ${Object.keys(scenes).join(", ")})`);
  frames.push(s.from + (off == null ? Math.floor(s.frames / 2) : Math.min(Number(off), s.frames - 1)));
}

mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(root, "src/index.js"), enableCaching: false });
const inputProps = guides ? { guides: true } : {};
const composition = await selectComposition({ serveUrl, id, inputProps });
for (const frame of frames) {
  const output = path.join(outDir, `${id}-${String(frame).padStart(4, "0")}${guides ? "-guides" : ""}.png`);
  await renderStill({ serveUrl, composition, frame, output, inputProps });
  console.log(output);
}
