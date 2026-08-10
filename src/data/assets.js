/**
 * Every Tiny Swords file the game touches, in one place.
 *
 * Paths are the pack's real relative paths (copied verbatim into
 * public/assets/tiny-swords/), so nothing here is invented. If a file
 * is missing at runtime the AssetManager substitutes a flat colour
 * placeholder and logs a warning instead of failing.
 */

export const ASSET_ROOT = 'assets/tiny-swords/';

/**
 * Extra effect sheets from CodeManu's public-domain "Free Pixel Effects
 * Pack" (https://codemanu.itch.io/pixelart-effect-pack) — see
 * public/assets/fx/pixel-effects/ATTRIBUTION.txt. Entries opt into this
 * root with `root: FX_ROOT`.
 */
export const FX_ROOT = 'assets/fx/';

/** key -> { path, fallback } (fallback = placeholder tint if absent) */
export const IMAGES = {
  // ---- player unit sprite sheets (Units/<Colour> Units/...) --------
  pawn_blue: { path: 'Units/Blue Units/Pawn/Pawn_Idle.png', fallback: '#6f9ede' },
  warrior_blue: { path: 'Units/Blue Units/Warrior/Warrior_Idle.png', fallback: '#5b8ad6' },
  archer_blue: { path: 'Units/Blue Units/Archer/Archer_Idle.png', fallback: '#7fc7e8' },
  lancer_blue: { path: 'Units/Blue Units/Lancer/Lancer_Idle.png', fallback: '#4a7fd0' },
  lancer_yellow: { path: 'Units/Yellow Units/Lancer/Lancer_Idle.png', fallback: '#e6c34a' },
  lancer_red: { path: 'Units/Red Units/Lancer/Lancer_Idle.png', fallback: '#d95c4a' },
  lancer_purple: { path: 'Units/Purple Units/Lancer/Lancer_Idle.png', fallback: '#9a6ad4' },
  lancer_black: { path: 'Units/Black Units/Lancer/Lancer_Idle.png', fallback: '#4b4f68' },

  // ---- enemy sprite sheets ---------------------------------------
  sheep: { path: 'Resources/Sheep/HappySheep_Idle.png', fallback: '#f2ecd8' },
  goblin_torch_red: { path: 'Factions/Goblins/Troops/Torch/Red/Torch_Red.png', fallback: '#7ec24a' },
  goblin_torch_purple: {
    path: 'Factions/Goblins/Troops/Torch/Purple/Torch_Purple.png',
    fallback: '#a06ad4',
  },
  goblin_torch_yellow: {
    path: 'Factions/Goblins/Troops/Torch/Yellow/Torch_Yellow.png',
    fallback: '#e0c04a',
  },
  goblin_tnt_red: { path: 'Factions/Goblins/Troops/TNT/Red/TNT_Red.png', fallback: '#d0504a' },
  goblin_tnt_purple: {
    path: 'Factions/Goblins/Troops/TNT/Purple/TNT_Purple.png',
    fallback: '#8a5ac0',
  },
  warrior_red: { path: 'Units/Red Units/Warrior/Warrior_Idle.png', fallback: '#d24a4a' },
  warrior_purple: { path: 'Units/Purple Units/Warrior/Warrior_Idle.png', fallback: '#9a5ad0' },
  warrior_black: { path: 'Units/Black Units/Warrior/Warrior_Idle.png', fallback: '#3f4258' },
  archer_black: { path: 'Units/Black Units/Archer/Archer_Idle.png', fallback: '#55596f' },
  archer_red: { path: 'Units/Red Units/Archer/Archer_Idle.png', fallback: '#c8564a' },
  monk_purple: { path: 'Units/Purple Units/Monk/Idle.png', fallback: '#b28ae0' },

  // ---- effects ---------------------------------------------------
  fx_explosion: { path: 'Particle FX/Explosion_02.png', fallback: '#ffcf5a' },
  fx_burst: { path: 'Particle FX/Explosion_01.png', fallback: '#fff0b0' },
  fx_dust: { path: 'Particle FX/Dust_01.png', fallback: '#e8dcc0' },
  fx_dust_big: { path: 'Particle FX/Dust_02.png', fallback: '#d8cbb0' },
  fx_impact: { path: 'Effects/Explosion/Explosions.png', fallback: '#ffb040' },
  fx_freezing: { path: 'pixel-effects/19_freezing_spritesheet.png', root: FX_ROOT, fallback: '#bfeaff' },
  fx_phantom: { path: 'pixel-effects/14_phantom_spritesheet.png', root: FX_ROOT, fallback: '#b678ec' },
  fx_flame: { path: 'pixel-effects/11_fire_spritesheet.png', root: FX_ROOT, fallback: '#ff8a3a' },

  // ---- environment ----------------------------------------------
  ground_tiles: { path: 'Terrain/Ground/Tilemap_Flat.png', fallback: '#6aa84f' },
  tree: { path: 'Terrain/Resources/Wood/Trees/Tree1.png', fallback: '#3f7a3a' },
  tree_alt: { path: 'Terrain/Resources/Wood/Trees/Tree2.png', fallback: '#35692f' },
  bush: { path: 'Terrain/Decorations/Bushes/Bushe1.png', fallback: '#4c8f43' },
  cloud_a: { path: 'Terrain/Decorations/Clouds/Clouds_01.png', fallback: '#ffffff' },
  cloud_b: { path: 'Terrain/Decorations/Clouds/Clouds_03.png', fallback: '#ffffff' },
  cloud_c: { path: 'Terrain/Decorations/Clouds/Clouds_05.png', fallback: '#ffffff' },
  rock_a: { path: 'Terrain/Decorations/Rocks/Rock2.png', fallback: '#8c93a8' },
  rock_b: { path: 'Terrain/Decorations/Rocks/Rock3.png', fallback: '#8c93a8' },
  deco_mushroom: { path: 'Deco/03.png', fallback: '#d0504a' },
  deco_stone: { path: 'Deco/06.png', fallback: '#a8c0d0' },
  deco_bush: { path: 'Deco/09.png', fallback: '#3f7a4a' },
  deco_grass: { path: 'Deco/11.png', fallback: '#6aa84f' },
  deco_skull_sign: { path: 'Deco/16.png', fallback: '#c8b8a0' },
  deco_sign: { path: 'Deco/17.png', fallback: '#8a5f3c' },
  tower: { path: 'Factions/Knights/Buildings/Tower/Tower_Blue.png', fallback: '#5878b0' },
  house: { path: 'Factions/Knights/Buildings/House/House_Blue.png', fallback: '#8a5f3c' },

  // ---- UI Elements: chrome (ribbons, paper panels, pause button) ---
  ui_ribbons: { path: 'UI Elements/UI Elements/Ribbons/BigRibbons.png', fallback: '#2f3556' },
  ui_paper: { path: 'UI Elements/UI Elements/Papers/SpecialPaper.png', fallback: '#3a4160' },
  ui_btn_round: {
    path: 'UI Elements/UI Elements/Buttons/SmallBlueRoundButton_Regular.png',
    fallback: '#3d8fae',
  },
  ui_btn_round_pressed: {
    path: 'UI Elements/UI Elements/Buttons/SmallBlueRoundButton_Pressed.png',
    fallback: '#2b6a83',
  },

  // ---- UI icons (single 64x64 images) ----------------------------
  icon_gold: { path: 'UI Elements/UI Elements/Icons/Icon_03.png', fallback: '#f5c542' },
  icon_meat: { path: 'UI Elements/UI Elements/Icons/Icon_04.png', fallback: '#e2564b' },
  icon_swords: { path: 'UI Elements/UI Elements/Icons/Icon_05.png', fallback: '#7fc7e8' },
  icon_shield: { path: 'UI Elements/UI Elements/Icons/Icon_06.png', fallback: '#4aa3c7' },
  icon_arrow_up: { path: 'UI Elements/UI Elements/Icons/Icon_07.png', fallback: '#6fbf4a' },
  icon_music: { path: 'UI Elements/UI Elements/Icons/Icon_12.png', fallback: '#fbeccd' },
  icon_hammer: { path: 'Terrain/Resources/Tools/Tool_01.png', fallback: '#8a5f3c' },
  icon_axe: { path: 'Terrain/Resources/Tools/Tool_02.png', fallback: '#a8b0c0' },
  icon_sword: { path: 'Terrain/Resources/Tools/Tool_03.png', fallback: '#c8d0e0' },
  icon_meat_res: { path: 'Terrain/Resources/Meat/Meat Resource/Meat Resource.png', fallback: '#e2564b' },
};

/**
 * Per-icon zoom for the DOM UI.
 *
 * The pack's icons do not fill their frames equally: measured content
 * boxes inside a 64px frame run from 20px (Tool_03) to 63px (Icon_06).
 * Left alone, a sword reads a third the weight of a shield in the same
 * row. These factors even them out; anything absent renders at 1.
 * (Numbers via `npm run probe -- <file> --frame 64x64`.)
 */
export const ICON_ZOOM = {
  icon_sword: 2.9, // Tool_03 — 20px of content
  icon_hammer: 2.1, // Tool_01 — 28px
  icon_axe: 2.15, // Tool_02 — 27px
  icon_meat_res: 1.25, // Meat Resource — 47px
  icon_arrow_up: 1.15, // Icon_07 — 43x51px
};

/**
 * Vite substitutes the configured `base` here at build time, so the game
 * works when served from a subpath (GitHub Pages project sites live at
 * /<repo>/). Falls back to a relative path outside a Vite bundle.
 */
const BASE_URL = import.meta.env?.BASE_URL ?? './';

/** URL for an image path, safe for the pack's spaces and parentheses. */
export function assetUrl(path, root = ASSET_ROOT) {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${BASE_URL}${BASE_URL.endsWith('/') ? '' : '/'}${root}${encoded}`;
}
