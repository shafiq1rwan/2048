# Merge Knights — 2048 × fantasy RPG

A 4×4 merge game where every merge is an attack. Slide units together, the
stronger unit that appears strikes the enemy above the board, and an attack
countdown gives you a few turns to line up a big merge before it hits back.

Built with **Three.js** (orthographic, 2D textured planes) + **Vite**, plain
ES modules, no framework. Art is the **Tiny Swords** pack, used as-is.

**Play it:** https://shafiq1rwan.github.io/2048/

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
npm run preview    # serve the built bundle
npm test           # headless logic + balance checks (no browser needed)
```

## Installable (PWA)

The game installs to a home screen / desktop and runs offline. `public/`
carries a `manifest.webmanifest`, generated 192/512/maskable icons and a
service worker; the title screen shows an **Install app** button when the
browser offers one.

The service worker caches the shell on install and everything else on first
use, rather than maintaining a precache list — the build output is
content-hashed and the art is 500+ PNGs. Navigations are network-first (so a
deploy is picked up) with the cached shell as the offline fallback; hashed
assets are cache-first. Bump `CACHE` in [public/sw.js](public/sw.js) when the
shell changes. It is only registered in production builds, so it never caches
over your dev edits.

Icons are generated from the game's own blue Warrior frame — regenerate them
by re-running the script in the commit history if the unit art changes.

## Deploying

Every push to `main` builds and publishes to GitHub Pages via
[.github/workflows/deploy.yml](.github/workflows/deploy.yml). The deploy is
gated on `npm test`, so a broken merge rule or a malformed sprite descriptor
fails the build instead of shipping.

One-time setup: **Settings → Pages → Source → GitHub Actions**.

`vite.config.js` uses `base: './'` and `data/assets.js` resolves paths against
`import.meta.env.BASE_URL`, so the bundle is path-agnostic — it works at the
domain root, under a `/<repo>/` project path, or opened from disk, with no
repo name hardcoded anywhere.

## Controls

| Input | Action |
| --- | --- |
| `WASD` / arrow keys | slide the board |
| swipe (touch or drag) | slide the board |
| `1` `2` `3` | pick an upgrade / buy from the shop |
| `Enter` / `Space` | confirm the primary button on a modal |

## How it plays

- **Merge = attack.** Two matching units combine into the next unit, which
  immediately fires at the enemy. Damage is `2 ^ mergedLevel`, then the
  player's flat bonus, damage multiplier and crit roll are applied.
- **Turns.** Every *valid* move is one turn. An illegal move nudges the board
  and costs nothing. The enemy only swings when its countdown reaches zero,
  so moving is never punished directly — and a turn that kills the enemy
  skips the countdown tick entirely.
- **Floors.** Beat an enemy for gold and XP, then the next one walks in. Every
  5th floor is a boss: far more HP, harder hits, a longer countdown, triple
  rewards, and a shop afterwards. Gold drops as coins that tumble out of the
  corpse and then magnetise into the HUD purse, each crediting its share as it
  lands, so the counter climbs in step with the coins.
- **Levelling.** Enough XP pauses the game for a three-choice upgrade.
- **Game over** when HP hits 0 **or** the board has no legal move left. Score,
  deepest floor, strongest unit and boss count persist in `localStorage`.

## Unit ladder

| Lv | Name | Tiny Swords sprite |
| --- | --- | --- |
| 1 | Recruit | `Units/Blue Units/Pawn/Pawn_Idle.png` |
| 2 | Swordsman | `Units/Blue Units/Warrior/Warrior_Idle.png` |
| 3 | Archer | `Units/Blue Units/Archer/Archer_Idle.png` |
| 4 | Knight | `Units/Blue Units/Lancer/Lancer_Idle.png` |
| 5 | Elite Knight | `Units/Yellow Units/Lancer/Lancer_Idle.png` |
| 6 | Champion | `Units/Red Units/Lancer/Lancer_Idle.png` |
| 7 | Royal Guard | `Units/Purple Units/Lancer/Lancer_Idle.png` |
| 8 | Hero | `Units/Black Units/Lancer/Lancer_Idle.png` |
| 9+ | Legend, Warlord, Demigod… | Hero sprite + golden aura + star pips |

Each tile also shows its level number, and the plate colour escalates with it.

## Layout

```
src/
  main.js                  entry: load assets, wire managers, hand off to Game
  Game.js                  the only place that knows the order of events
  core/
    config.js              design box, board metrics, timings, layer order
    Tween.js               delta-time tween/timer runner + easings
    SaveManager.js         localStorage records
  board/
    Board.js               grid state + spawn rules
    Tile.js                one unit's state (no render data)
    MergeSystem.js         pure 2048 slide/merge rules
  combat/
    Player.js              HP, XP, gold, damage modifiers
    Enemy.js               one live enemy
    CombatSystem.js        damage maths, countdown, rewards
  progression/
    EnemyManager.js        walks the floor ladder
    UpgradeSystem.js       three-choice level-up rolls
    ShopSystem.js          post-boss shop
  rendering/
    Renderer.js            three.js setup, orthographic design box, resize
    AssetManager.js        the only module that knows a file path
    SpriteAnimator.js      sheet UV stepping + SpriteEntity / EffectSprite
    BoardView.js           tile meshes and all board animation
    BattlefieldView.js     sky, grass, scenery, the enemy and its reactions
    Effects.js             particles, damage numbers, bolts, screen flashes
    CameraShake.js
    Textures.js            procedural plates, glows, sky, text
  input/InputManager.js    keyboard + swipe, emits intent only
  ui/UIManager.js          HUD + modal screens (DOM)
  audio/SoundManager.js    WebAudio synth (the pack ships no audio)
  data/
    assets.js              key -> real Tiny Swords path + placeholder colour
    units.js               merge ladder + sprite-sheet geometry
    enemies.js             roster + all difficulty curves
    upgrades.js            level-up pool + shop stock

public/assets/tiny-swords/ the pack's PNGs, copied verbatim, original paths kept
art-source/                the pack's .aseprite editables — not served, not bundled
tests/run.js               headless logic + balance checks
```

`public/assets/tiny-swords/` holds the 517 PNGs the game loads, under the
pack's own relative paths (spaces and all — `AssetManager` URL-encodes them),
so every path in `data/assets.js` matches a real file in the original pack.

The pack's 54 `.aseprite` editable sources live in `art-source/`, mirroring the
same folder structure. They are deliberately outside `public/` so Vite neither
serves nor bundles 2.5 MB of art sources into `dist/`.

State, rendering and input are separate: `board/`, `combat/` and
`progression/` never import three.js or touch the DOM, which is what lets
`npm test` run them under Node.

### Notes on the art integration

- Sprite-sheet geometry (frame size, grid, frame count, and the transparent
  padding around each character) was measured from the real PNGs, not guessed.
  Each sheet records `footY` and `charH`, so `SpriteEntity` can baseline-align
  and size sprites consistently even though frames range from 64px to 320px —
  a 320px Lancer and a 192px Pawn end up looking like the same scale of soldier.
- Pixel art is kept crisp with `NearestFilter`, no mipmaps and no tone mapping.
- The grass is one fully-opaque interior tile copied out of
  `Terrain/Ground/Tilemap_Flat.png` into a repeating texture.
- A missing file logs a warning and falls back to a flat colour placeholder,
  so the game always runs.
- Sound is synthesised, because the pack contains no audio. `SoundManager.play(name)`
  is the single hook if you want to drop in real samples later.

## Swapping in a different art pack

Nothing outside `data/` and `public/` knows about the artwork, so retargeting
the game to another pixel-art pack means editing three data files:

1. Copy the pack's PNGs into `public/assets/tiny-swords/` (or a sibling folder
   and update `ASSET_ROOT` in `data/assets.js`).
2. Measure the sheets:

   ```bash
   npm run probe -- path/to/pack                      # list sizes + candidate frame sizes
   npm run probe -- path/to/sheet.png --frame 64x64 --name goblin
   ```

   `tools/probe-assets.mjs` decodes PNGs with Node's built-in zlib (no
   dependencies) and reports the frame grid, how many frames each row
   actually uses, and the alpha bounding box — then prints a ready-to-paste
   sheet descriptor. It reproduces the current Tiny Swords numbers exactly,
   so it is the same measurement the existing data was built from.
3. Point `data/assets.js` at the new paths and drop the descriptors into
   `data/units.js` (merge ladder) and `data/enemies.js` (roster).

Because sprites are sized from `footY`/`charH` rather than the frame box, a
pack with different frame padding or a different resolution needs no changes
to the renderer. `npm test` validates that every descriptor is self-consistent
(frames within columns, row within rows, footY inside the frame).

The one thing to check by hand is `charH` for sprites with tall props — the
probe reports the full bounding box, which for a raised spear or bow makes the
body read too small. Shrink `charH` until the *body* sets the scale.

## Credits

Art: [Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) by Pixel Frog.
If you swap packs, update this section — most itch.io packs (RpgMix, for
example, is CC-BY 4.0) require attribution.

## Tuning

- Difficulty: the `scale*` functions and boss multipliers in `data/enemies.js`.
- Feel: every duration lives in `TIME` in `core/config.js`.
- HUD type: the `--fs-1`..`--fs-5` tokens at the top of `styles/main.css`. Each
  is `max(floor, N * var(--u))` — text follows the board's scale but never
  shrinks below a legible size, which matters because the board fills ~98% of
  the width, so a 390px phone renders the design box at 0.78x.
- Camera shake: every magnitude lives in `SHAKE` in `core/config.js`. Peaks are
  around 4–8 design units (under 2% of the board's width). Lower `SHAKE.scale`
  to soften all of it at once, or set it to `0` to turn shake off completely.
- Layout: `DESIGN`, `BOARD` and `SCENE` in `core/config.js` (the comment there
  documents the vertical budget).
- Corner rounding: `BOARD.cornerRadius` sets the cells; the frame derives
  `cornerRadius + padding` so its corner stays concentric with them. Radii are
  written in design units and converted to each texture's resolution in
  `BoardView.js`, so changing cell size or padding keeps the corners aligned.
