import { AbsoluteFill } from "remotion";
import { BG, BORDER, SANS, TEXT, WHITE, useInk } from "../../brand/brand.js";
import { BEAKER, TALON } from "../../brand/sprites.js";
import { BrandBug } from "../../kit/Brand.jsx";
import { Caption } from "../../kit/Caption.jsx";
import { FrameSprite } from "../../kit/FrameSprite.jsx";
import { PhoneFrame, SCREEN } from "../../kit/PhoneFrame.jsx";
import { SafeZoneGuide } from "../../kit/SafeZoneGuide.jsx";
import { Tap } from "../../kit/Tap.jsx";
import { Caret, useTyping } from "../../kit/typing.jsx";

// A test card for the shared kit (not a video): every piece on one screen.
export function KitCheck({ guides = true }) {
  const ink = useInk();
  const typed = useTyping([{ text: "marine biology research", typo: { at: 4, wrong: "j" } }], { start: 5, seed: "kit" });
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: SANS }}>
      <BrandBug />
      <Caption text="every fact about them links to a *source*" />
      <PhoneFrame>
        <div style={{ position: "absolute", top: SCREEN.statusBar + 12, left: 16, right: 16 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <FrameSprite sprite={BEAKER} scale={2} />
            <FrameSprite sprite={TALON} scale={2} offset={7} />
          </div>
          <div style={{ marginTop: 12, background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "12px 14px",
            fontSize: 15, color: TEXT }}>
            {typed.value}<Caret typing={typed.typing} color={ink.accent} />
          </div>
          <div style={{ marginTop: 12, background: ink.button.bg, color: ink.button.fg, borderRadius: 12, padding: "12px 14px",
            fontWeight: 700, fontSize: 16, textAlign: "center" }}>Find people</div>
        </div>
        <Tap at={60} x={187} y={SCREEN.statusBar + 12 + 64 + 12 + 46 + 12 + 22} />
      </PhoneFrame>
      {guides && <SafeZoneGuide />}
    </AbsoluteFill>
  );
}
