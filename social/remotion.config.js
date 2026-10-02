import { Config } from "@remotion/cli/config";

// bt709 tags the colors the way TikTok and Instagram expect, so their
// re-encode keeps the app's grey and the accent where they were.
Config.setColorSpace("bt709");
