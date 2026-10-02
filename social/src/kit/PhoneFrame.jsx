import { useCurrentFrame } from "remotion";
import { noise2D } from "@remotion/noise";
import { BG, BORDER, H, LAYOUT, SANS, TEXT, TEXT_MUTED, WHITE } from "../brand/brand.js";

// A phone filmed close up: a plain dark body running off the bottom of the
// frame (so it reads as a phone held up to a camera, not a mockup floating in
// space), and a slow handheld drift of a few pixels. Seeded noise, so every
// render drifts the same way.
//
// Children draw in the app's own mobile coordinates: SCREEN.width (374) CSS
// pixels wide, from the top of the screen, and the phone scales them up 2x.
// So rebuilt screens use the app's real sizes (15px body text, 44px buttons)
// and come out at the size they'd be filmed.

export const PHONE = { left: 150, top: LAYOUT.phoneTop, width: 780, bezel: 16, radius: 78, scale: 2 };
export const SCREEN = {
  width: (PHONE.width - PHONE.bezel * 2) / PHONE.scale,                 // 374
  height: Math.floor((H - PHONE.top - PHONE.bezel) / PHONE.scale),      // what shows above the frame's bottom edge
  statusBar: 46,                                                        // content starts below this
};

function StatusBar({ time = "4:12" }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: SCREEN.statusBar, display: "flex",
      alignItems: "center", justifyContent: "space-between", padding: "4px 26px 0 30px", boxSizing: "border-box",
      fontFamily: SANS, fontWeight: 700, fontSize: 15, color: TEXT, zIndex: 5 }}>
      <span>{time}</span>
      <div style={{ position: "absolute", left: "50%", top: 11, width: 104, height: 30, marginLeft: -52, borderRadius: 20, background: "#0b0b0b" }} />
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        {/* signal */}
        <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 11 }}>
          {[4, 6, 8, 11].map((h) => <span key={h} style={{ width: 3, height: h, borderRadius: 1, background: TEXT }} />)}
        </span>
        {/* battery */}
        <span style={{ position: "relative", width: 24, height: 12, border: `1.5px solid ${TEXT}`, borderRadius: 4, boxSizing: "border-box", opacity: 0.9 }}>
          <span style={{ position: "absolute", left: 1.5, top: 1.5, bottom: 1.5, width: 13, borderRadius: 1.5, background: TEXT }} />
        </span>
      </span>
    </div>
  );
}

/** The phone's drift at a frame: a few pixels and a fraction of a degree. */
export function handheld(frame, seed = "phone", amount = 1) {
  const t = frame * 0.018;
  return {
    x: noise2D(`${seed}-x`, t, 0) * 4 * amount,
    y: noise2D(`${seed}-y`, t, 0.5) * 4 * amount,
    r: noise2D(`${seed}-r`, t, 1) * 0.3 * amount,
  };
}

export function PhoneFrame({ children, seed = "phone", drift = 1, time, screenBg = BG, demoTag = false, style }) {
  const frame = useCurrentFrame();
  const d = handheld(frame, seed, drift);
  const bodyH = H - PHONE.top + 260; // runs well past the bottom edge
  return (
    <div style={{ position: "absolute", left: PHONE.left, top: PHONE.top, width: PHONE.width, height: bodyH,
      transform: `translate(${d.x}px, ${d.y}px) rotate(${d.r}deg)`, transformOrigin: "50% 30%", ...style }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: PHONE.radius, background: "#1c1b1a",
        boxShadow: "0 30px 60px rgba(20,20,19,0.16), inset 0 0 0 2px #34322f" }} />
      <div style={{ position: "absolute", left: PHONE.bezel, top: PHONE.bezel, right: PHONE.bezel, bottom: 0,
        borderRadius: PHONE.radius - PHONE.bezel, overflow: "hidden", background: screenBg }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: SCREEN.width, height: SCREEN.height + 140,
          transform: `scale(${PHONE.scale})`, transformOrigin: "0 0" }}>
          <StatusBar time={time} />
          {children}
        </div>
      </div>
      {demoTag && (
        <div style={{ position: "absolute", right: 40, top: -54, fontFamily: SANS, fontWeight: 700, fontSize: 28,
          color: TEXT_MUTED, background: WHITE, border: `1.5px solid ${BORDER}`, borderRadius: 999, padding: "5px 18px" }}>
          demo data
        </div>
      )}
    </div>
  );
}
