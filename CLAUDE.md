# CLAUDE.md

Merge Knights — a 2048 × RPG browser game. Three.js (orthographic 2D, textured
planes) + Vite, plain ES modules, no framework, no TypeScript. Art is the Tiny
Swords pack, used as-is. See README.md for gameplay and player-facing docs.

## Commands

```bash
npm run dev        # http://localhost:5173
npm run build      # -> dist/ (also trims unreferenced art, see vite.config.js)
npm test           # headless logic + balance checks, no browser — gates deploy
npm run probe -- <file-or-dir> [--frame WxH] [--name key]   # measure sprite sheets
```

Deploy: push to `main` → GitHub Actions builds and publishes to GitHub Pages
(`.github/workflows/deploy.yml`, gated on `npm test`).

## Architecture — where things go

- **`src/board/`, `src/combat/`, `src/progression/` are pure**: no three.js, no
  DOM imports, ever. That is what lets `tests/run.js` run them under Node. New
  game rules go here first, with tests.
- **`src/Game.js`** is the only file that knows the order of events (turn
  sequence, attack/death/reward beats). Systems never call each other directly.
- **`src/ui/UIManager.js`** is the only file that touches the DOM.
  **`src/rendering/`** is the only place three.js appears.
- **`src/data/assets.js`** is the only file that knows an image path. Do not
  scatter paths. A missing file falls back to a colored placeholder and logs —
  the game must always run.
- **`src/ui/PackArt.js`** composites the pack's "UI Elements" slice sheets
  (measured rects; transparent gutters make the raw files unusable as CSS
  backgrounds) into data URLs — e.g. the enemy-name ribbon. Note: border-image
  scaling ignores `image-rendering` in Chromium, so 9-slice button skins smear;
  don't retry that without a per-size canvas composition.
- **`src/core/config.js`** holds every tuning number: the design box, board
  metrics, all animation durations (`TIME`), all shake magnitudes (`SHAKE`),
  render layering (`RENDER_LAYER`). Difficulty curves live in
  `src/data/enemies.js`; combo/intent maths in `src/combat/CombatSystem.js`.

## Conventions that are easy to break

- **Design units**: the camera shows a 500×1000 box scaled to fit; the DOM HUD
  aligns to it via `stageRect` → CSS vars. `--u` is set **with a `px` unit**
  (`0.78px`); `calc(N * var(--u))` breaks silently if it's ever unitless.
  HUD font sizes are `max(floor, calc(N * var(--u)))` tokens (`--fs-1..5`).
- **Sprite sheets are measured, not guessed**: every descriptor
  (`frameW/frameH/cols/rows/row/frames/fps/footY/charH/centerX`) comes from
  `npm run probe`. `footY`/`charH` baseline-align sheets with different
  padding; for sprites holding tall props, hand-shrink `charH` so the *body*
  sets the scale. Tests validate descriptor self-consistency.
- **Rendering is `depthTest: false` + explicit `renderOrder`** (`RENDER_LAYER`),
  `NearestFilter`, no mipmaps, no tone mapping. Never rely on z.
- **Restart safety**: every awaited animation promise must settle on restart —
  tweens take `onCancel`, async gameplay sequences guard with the `runToken`
  pattern (`const token = this.runToken; ... if (token !== this.runToken) return`).
  If you add an awaited effect, wire its cancel path and test a mid-flight
  restart.
- **Nested rounded corners**: outer radius = inner radius + gap between them.
  `BOARD.cornerRadius` drives cells; the frame derives `+ padding`. Radii are
  design units converted per-texture in `BoardView.js`.
- **Locked tiles** (rubble `kind: 'rubble'`, frozen `frozenFor > 0`) are walls:
  `MergeSystem.slide` runs per segment between them and `hasMoves` knows an
  empty cell behind a wall may be unreachable. Touch these rules only with
  tests alongside.
- **Modals**: refresh panel content in place — replacing `.panel`'s outerHTML
  replays the entry animation and reads as the popup reopening. Number keys
  1-3 bind to the three fixed slots by position, not to whatever is enabled.
- The title screen uses `openPanel(..., { fullscreen: true })`; other modals
  are dialogs. `.panel h1` outranks lone-class selectors — scope title styles
  under `.panel.is-title`.

## Verification workflow

1. `npm test` after any logic change (63+ assertions incl. a greedy
   auto-player balance sim — keep it surviving several floors).
2. For anything visible, verify in a real browser: build, serve `dist/` under
   a `/2048/` subpath (mirroring GitHub Pages), and drive it with
   playwright-core using the **system Edge**
   (`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`, flags
   `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`) — no
   browser download needed. Treat any console error or HTTP ≥ 400 as a
   failure. `window.game` is exposed for state manipulation; note
   `page.evaluate(() => game.someAsync())` hangs on returned promises — wrap
   in braces. Park the mouse (`page.mouse.move(5, 5)`) before pixel-exact
   layout measurements: `:hover` lifts cards by 2px.
3. Check phone portrait (390×844) **and** short landscape (740×380) for UI
   work — both have dedicated media queries.

## Gotchas

- `vite.config.js` imports `IMAGES` from `src/data/assets.js` to trim unused
  art from `dist/` after build. Adding an asset to `data/assets.js` is all a
  new file needs to ship; art in `public/assets/tiny-swords/` keeps the pack's
  original relative paths (spaces included — `assetUrl` URL-encodes).
- Bump `CACHE` in `public/sw.js` when shell files (index.html set) change
  meaningfully; hashed assets are cache-first, navigations network-first. The
  SW registers in production builds only.
- `import.meta.env.BASE_URL` + `base: './'` keep the bundle path-agnostic —
  never hardcode the repo name or absolute URLs.
- The pack ships no audio; all sound is WebAudio-synthesised in
  `SoundManager.play(name)` — the single hook if real samples arrive.
- Do not redesign or regenerate the Tiny Swords artwork. `art-source/` holds
  the pack's `.aseprite` sources and is deliberately outside `public/`.

## Project state (beyond the code)

- GitHub Pages needs one manual setting before deploys go live:
  repo Settings → Pages → Source → **GitHub Actions**.
- A swap to the RpgMix art pack is planned but blocked on purchasing the pack;
  `tools/probe-assets.mjs` + the README's "Swapping in a different art pack"
  section document the data-only workflow.
