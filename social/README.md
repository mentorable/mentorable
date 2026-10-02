# Mentorable social videos

Short vertical videos for TikTok and Instagram Reels, made with
[Remotion](https://www.remotion.dev). One a day, alternating college
application advice and product demos. Plan: `.claude/SOCIAL_VIDEO_PLAN.md`
(local only).

```bash
cd social
npm install
npm run studio                                            # preview and scrub in the browser
node scripts/stills.mjs Agents001 all --guides            # stills of every scene, with the safe zones shown
npm run render:001                                        # out/001-agents.mp4 and its cover
```

## How it's put together

- `src/brand/` imports the app's own tokens (`src/components/ui/tokens.base.js`),
  theme helpers, mascot sprites and agent copy, so the videos change when the
  app does. Never copy a token or a line from the app; import it.
- `src/kit/` is what every video shares: `FrameSprite` (mascots driven by the
  video clock), `Caption`, `PhoneFrame`, `Tap`, `PunchIn`, typing, the brand
  line and the safe-zone guide.
- `src/screens/` holds rebuilt app screens, props in, picture out, so the next
  demo video reuses them.
- `src/videos/<number>-<slug>/` is one video: `timeline.js` (scene lengths),
  `copy.js` (every caption), `demoData.js` (invented people and finds),
  `scenes/`, and `POST.md` (what to post with it).

## Rules that keep it from looking AI made

- The real product's look: the app's grey, white cards, Raleway, the pixel
  mascots. No glows, gradients, particles or sparkle icons.
- Unhurried: every state a viewer should read holds 1.5 s or more. Hard cuts,
  slow smooth scrolls, at most two gradual push-ins a video, a little handheld
  drift, real-looking taps and uneven typing. Everything seeded from the frame
  number, so renders repeat.
- Everything centred on the canvas; text in sentence case.
- Captions sound like a person: sentence case, short, specific, no em dashes.
  Name what a thing is (Beaker and Talon are "agents") the first time it appears.
- Demo data is invented. No real professor, school or scholarship is named.
- Every claim on screen is something the product actually does.

Captions and anything a viewer must read stay inside `SAFE` in
`src/brand/brand.js`; TikTok and Reels cover the rest with their own buttons.

Remotion is free for individuals and companies of up to 3 people; a larger
team needs its company license.
