import { random, useCurrentFrame } from "remotion";

// Typing that looks like a thumb on a phone, not a typewriter: uneven gaps,
// a beat after each word, the odd hesitation, an optional typo noticed and
// fixed, and a held backspace that speeds up. All of it seeded, so a render
// is identical every time.
//
// A script is a list of steps:
//   { text: "Dear Professor", typo: { at: 5, wrong: "r" } }  type, with one typo
//   { pause: 12 }                                            wait (frames)
//   { erase: true }  or  { erase: 6 }                        backspace all / n chars

function build(steps, seed) {
  const events = [{ f: 0, value: "" }];
  let f = 0;
  let value = "";
  let n = 0;
  const gap = () => {
    n += 1;
    const r = random(`${seed}-${n}`);
    // 2 to 4 frames a key (an easy thumb at 30 fps), and now and then a
    // longer think.
    return 2 + Math.floor(r * 2.6) + (random(`${seed}-h-${n}`) < 0.06 ? 5 : 0);
  };
  const push = (next, wait) => {
    f += wait;
    value = next;
    events.push({ f, value });
  };
  for (const step of steps) {
    if (step.pause) {
      f += step.pause;
    } else if (step.text != null) {
      [...step.text].forEach((ch, i) => {
        if (step.typo && step.typo.at === i) {
          push(value + step.typo.wrong, gap());
          f += 7; // notices
          push(value.slice(0, -1), 3);
        }
        const afterSpace = value.endsWith(" ") ? 1 : 0;
        push(value + ch, gap() + afterSpace);
      });
    } else if (step.erase) {
      const count = step.erase === true ? value.length : Math.min(step.erase, value.length);
      for (let i = 0; i < count; i += 1) {
        // A held backspace: slow for the first few, then it runs.
        push(value.slice(0, -1), i < 2 ? 4 : i < 5 ? 2 : 1);
      }
    }
  }
  return events;
}

const CACHE = new Map();
function timeline(steps, seed) {
  const key = `${seed}::${JSON.stringify(steps)}`;
  if (!CACHE.has(key)) CACHE.set(key, build(steps, seed));
  return CACHE.get(key);
}

/** How long a script takes, in frames (useful for laying out a scene). */
export function typingLength(steps, seed = "type") {
  const ev = timeline(steps, seed);
  return ev[ev.length - 1].f;
}

/** The text a script shows at the current frame, starting at `start`.
 *  `typing` is true while keys are still landing (the caret stays solid). */
export function useTyping(steps, { start = 0, seed = "type" } = {}) {
  const frame = useCurrentFrame();
  const ev = timeline(steps, seed);
  const t = frame - start;
  let i = 0;
  while (i + 1 < ev.length && ev[i + 1].f <= t) i += 1;
  const last = ev[ev.length - 1].f;
  return {
    value: t < 0 ? "" : ev[i].value,
    typing: t >= 0 && t <= last + 4,
    done: t > last,
  };
}

/** A text caret: solid while typing, blinking (half a second on, half off) otherwise. */
export function Caret({ typing = false, color = "#141413", height = "1.15em", width = 2, style }) {
  const frame = useCurrentFrame();
  const on = typing || Math.floor(frame / 15) % 2 === 0;
  return (
    <span style={{ display: "inline-block", width, height, background: color, marginLeft: 1,
      verticalAlign: "text-bottom", opacity: on ? 1 : 0, ...style }} />
  );
}
