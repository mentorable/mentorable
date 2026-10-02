import { loadFont } from "@remotion/google-fonts/Raleway";

// Raleway everywhere, as in the app. Loaded through Remotion so a render waits
// for the font instead of drawing a fallback on the first frames.
export const { fontFamily: RALEWAY, waitUntilDone } = loadFont("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});
