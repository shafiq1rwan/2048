/**
 * Headless checks for the parts of the game that must be exactly right:
 * the 2048 slide/merge rules, combat maths and the progression curves.
 *
 * Run with `npm test` — no browser needed, these modules import nothing
 * from three.js or the DOM.
 */
import assert from 'node:assert/strict';

import { Board } from '../src/board/Board.js';
import { Tile, _resetTileIds } from '../src/board/Tile.js';
import { slide, hasMoves } from '../src/board/MergeSystem.js';
import { Player, xpForLevel } from '../src/combat/Player.js';
import { Enemy } from '../src/combat/Enemy.js';
import { CombatSystem, comboMultiplier, COMBO } from '../src/combat/CombatSystem.js';
import { EnemyManager } from '../src/progression/EnemyManager.js';
import { UpgradeSystem } from '../src/progression/UpgradeSystem.js';
import { ShopSystem } from '../src/progression/ShopSystem.js';
import { buildEnemy, BOSS_EVERY, FAMILY_FX } from '../src/data/enemies.js';
import { VOICES } from '../src/audio/SoundManager.js';
import { getUnit, UNITS, unitPower } from '../src/data/units.js';
import { UPGRADES, SHOP_ITEMS } from '../src/data/upgrades.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL  ${name}\n      ${err.message}`);
  }
}

/** Build a grid from a level matrix (0 = empty). */
function gridFrom(levels) {
  _resetTileIds();
  return levels.map((row, r) => row.map((level, c) => (level ? new Tile(level, r, c) : null)));
}

const levelsOf = (cells) => cells.map((row) => row.map((tile) => (tile ? tile.level : 0)));

// ---------------------------------------------------------------------
console.log('\n2048 slide + merge');
// ---------------------------------------------------------------------

test('slides tiles to the left edge without merging different levels', () => {
  const cells = gridFrom([
    [0, 1, 0, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = slide(cells, 'left');
  assert.equal(result.moved, true);
  assert.deepEqual(levelsOf(result.cells)[0], [1, 2, 0, 0]);
  assert.equal(result.merges.length, 0);
});

test('merges a matching pair into one tile of the next level', () => {
  const cells = gridFrom([
    [1, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = slide(cells, 'left');
  assert.deepEqual(levelsOf(result.cells)[0], [2, 0, 0, 0]);
  assert.equal(result.merges.length, 1);
  assert.equal(result.merges[0].level, 2);
});

test('a tile merges at most once per move (1,1,1,1 -> 2,2)', () => {
  const cells = gridFrom([
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = slide(cells, 'left');
  assert.deepEqual(levelsOf(result.cells)[0], [2, 2, 0, 0]);
  assert.equal(result.merges.length, 2);
});

test('does not chain a fresh merge result into another merge (2,1,1 -> 2,2)', () => {
  const cells = gridFrom([
    [2, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = slide(cells, 'left');
  assert.deepEqual(levelsOf(result.cells)[0], [2, 2, 0, 0]);
  assert.equal(result.merges.length, 1);
});

test('merges towards the movement direction, not away from it', () => {
  // moving right, the rightmost pair must combine at the right edge
  const cells = gridFrom([
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = slide(cells, 'right');
  assert.deepEqual(levelsOf(result.cells)[0], [0, 0, 1, 2]);
});

test('slides and merges vertically', () => {
  const cells = gridFrom([
    [3, 0, 0, 0],
    [3, 0, 0, 0],
    [0, 0, 0, 0],
    [2, 0, 0, 0],
  ]);
  const result = slide(cells, 'up');
  assert.deepEqual(
    levelsOf(result.cells).map((row) => row[0]),
    [4, 2, 0, 0],
  );
});

test('reports no movement for an already-packed line', () => {
  const cells = gridFrom([
    [1, 2, 3, 4],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = slide(cells, 'left');
  assert.equal(result.moved, false);
  assert.equal(result.moves.length, 0);
});

test('records where every moving tile came from', () => {
  const cells = gridFrom([
    [0, 0, 0, 5],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = slide(cells, 'left');
  assert.equal(result.moves.length, 1);
  assert.deepEqual(result.moves[0].from, { row: 0, col: 3 });
  assert.deepEqual(result.moves[0].to, { row: 0, col: 0 });
});

test('a merge records both the survivor and the absorbed tile', () => {
  const cells = gridFrom([
    [1, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = slide(cells, 'left');
  const absorbed = result.moves.filter((m) => m.absorbed);
  assert.equal(absorbed.length, 1);
  assert.equal(absorbed[0].tile, result.merges[0].absorbed);
  // the absorbed tile is gone from the new grid
  const ids = result.cells.flat().filter(Boolean).map((t) => t.id);
  assert.equal(ids.includes(absorbed[0].tile.id), false);
});

test('hasMoves sees an empty cell', () => {
  assert.equal(
    hasMoves(
      gridFrom([
        [1, 2, 3, 4],
        [2, 3, 4, 5],
        [3, 4, 5, 6],
        [4, 5, 6, 0],
      ]),
    ),
    true,
  );
});

test('hasMoves sees an adjacent matching pair on a full board', () => {
  assert.equal(
    hasMoves(
      gridFrom([
        [1, 2, 3, 4],
        [2, 3, 4, 5],
        [3, 4, 5, 6],
        [4, 5, 6, 6],
      ]),
    ),
    true,
  );
});

test('hasMoves returns false for a full, fully mismatched board', () => {
  assert.equal(
    hasMoves(
      gridFrom([
        [1, 2, 1, 2],
        [2, 1, 2, 1],
        [1, 2, 1, 2],
        [2, 1, 2, 1],
      ]),
    ),
    false,
  );
});

// ---------------------------------------------------------------------
console.log('\nBoard');
// ---------------------------------------------------------------------

test('starts with exactly two tiles', () => {
  const board = new Board();
  assert.equal(board.tiles().length, 2);
});

test('a valid move spawns exactly one new tile', () => {
  const board = new Board();
  board.cells = gridFrom([
    [1, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const result = board.move('left');
  assert.equal(result.moved, true);
  assert.ok(result.spawned, 'expected a spawned tile');
  // 2 tiles -> 1 merged + 1 spawned
  assert.equal(board.tiles().length, 2);
});

test('an invalid move spawns nothing and changes nothing', () => {
  const board = new Board();
  board.cells = gridFrom([
    [1, 2, 3, 4],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const before = JSON.stringify(board.toLevels());
  const result = board.move('left');
  assert.equal(result.moved, false);
  assert.equal(result.spawned, null);
  assert.equal(JSON.stringify(board.toLevels()), before);
});

test('spawned tiles are always level 1 or 2', () => {
  const board = new Board();
  for (let i = 0; i < 400; i++) {
    board.cells = gridFrom([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    const tile = board.spawn();
    assert.ok(tile.level === 1 || tile.level === 2, `unexpected level ${tile.level}`);
  }
});

test('spawn returns null on a full board', () => {
  const board = new Board();
  board.cells = gridFrom([
    [1, 2, 1, 2],
    [2, 1, 2, 1],
    [1, 2, 1, 2],
    [2, 1, 2, 1],
  ]);
  assert.equal(board.spawn(), null);
  assert.equal(board.canMove(), false);
});

test('a long random game never corrupts the grid', () => {
  const board = new Board();
  const dirs = ['up', 'down', 'left', 'right'];
  for (let i = 0; i < 4000; i++) {
    if (!board.canMove()) {
      board.reset();
      continue;
    }
    board.move(dirs[i % 4]);
    const tiles = board.tiles();
    assert.ok(tiles.length <= 16, 'more tiles than cells');
    const seen = new Set();
    for (const tile of tiles) {
      const key = `${tile.row},${tile.col}`;
      assert.equal(seen.has(key), false, `two tiles at ${key}`);
      seen.add(key);
      assert.equal(board.cells[tile.row][tile.col], tile, 'tile row/col out of sync with grid');
    }
  }
});

// ---------------------------------------------------------------------
console.log('\nPlayer + combat');
// ---------------------------------------------------------------------

test('merge damage is 2^level before bonuses', () => {
  const player = new Player();
  player.critChance = 0;
  for (const level of [2, 3, 4, 8]) {
    assert.equal(player.mergeDamage(level).damage, Math.pow(2, level));
  }
});

test('damage multipliers and flat bonuses both apply', () => {
  const player = new Player();
  player.critChance = 0;
  player.dmgMult = 1.5;
  player.flatAtk = 4;
  // (2^4 + 4) * 1.5 = 30
  assert.equal(player.mergeDamage(4).damage, 30);
});

test('a guaranteed crit doubles damage', () => {
  const player = new Player();
  player.critChance = 1;
  const hit = player.mergeDamage(3);
  assert.equal(hit.crit, true);
  assert.equal(hit.damage, 16);
});

test('shields absorb a whole hit and are consumed', () => {
  const player = new Player();
  player.shields = 1;
  const blocked = player.takeDamage(40);
  assert.equal(blocked.blocked, true);
  assert.equal(player.hp, 100);
  assert.equal(player.shields, 0);
  const through = player.takeDamage(40);
  assert.equal(through.blocked, false);
  assert.equal(player.hp, 60);
});

test('HP never falls below zero and death is reported', () => {
  const player = new Player();
  const result = player.takeDamage(999);
  assert.equal(player.hp, 0);
  assert.equal(result.dead, true);
  assert.equal(player.alive, false);
});

test('healing is capped at max HP', () => {
  const player = new Player();
  player.takeDamage(30);
  assert.equal(player.heal(999), 30);
  assert.equal(player.hp, player.maxHp);
});

test('XP rolls over multiple levels at once', () => {
  const player = new Player();
  const needed = xpForLevel(1) + xpForLevel(2);
  const result = player.addXp(needed);
  assert.equal(result.levelsGained, 2);
  assert.equal(player.level, 3);
  assert.ok(player.xp < player.xpToNext);
});

test('gold and XP multipliers are applied on gain', () => {
  const player = new Player();
  player.goldMult = 2;
  assert.equal(player.addGold(10), 20);
  assert.equal(player.gold, 20);
  assert.equal(player.spendGold(25), false);
  assert.equal(player.spendGold(20), true);
  assert.equal(player.gold, 0);
});

test('the countdown resets to the enemy base plus the player bonus', () => {
  const player = new Player();
  const enemies = new EnemyManager();
  const combat = new CombatSystem(player, enemies);
  const enemy = enemies.next();
  player.countdownBonus = 2;
  combat.resetCountdown(enemy);
  assert.equal(enemy.countdown, enemy.countdownMax + 2);
});

test('the enemy attacks only when the countdown hits zero', () => {
  const player = new Player();
  const enemies = new EnemyManager();
  const combat = new CombatSystem(player, enemies);
  const enemy = enemies.next();
  combat.resetCountdown(enemy);
  const turns = enemy.countdown;
  for (let i = 1; i < turns; i++) {
    assert.equal(combat.advanceTurn().attacks, false, `attacked early on turn ${i}`);
  }
  assert.equal(combat.advanceTurn().attacks, true);
});

test('an enemy attack resets the countdown', () => {
  const player = new Player();
  const enemies = new EnemyManager();
  const combat = new CombatSystem(player, enemies);
  const enemy = enemies.next();
  combat.resetCountdown(enemy);
  enemy.countdown = 0;
  combat.performEnemyAttack();
  assert.equal(enemy.countdown, enemy.countdownMax);
  assert.ok(player.hp < player.maxHp);
});

test('overkill damage is clamped to the enemy HP pool', () => {
  const enemy = new Enemy(buildEnemy(0));
  const result = enemy.takeDamage(enemy.maxHp + 500);
  assert.equal(result.dealt, enemy.maxHp);
  assert.equal(enemy.hp, 0);
  assert.equal(result.dead, true);
  assert.equal(enemy.alive, false);
});

test('merges do nothing once the enemy is already dead', () => {
  const player = new Player();
  const enemies = new EnemyManager();
  const combat = new CombatSystem(player, enemies);
  const enemy = enemies.next();
  enemy.hp = 0;
  assert.equal(combat.resolveMerge(5), null);
});

test('rewards register the defeat and count bosses', () => {
  const player = new Player();
  const enemies = new EnemyManager();
  const combat = new CombatSystem(player, enemies);
  for (let floor = 1; floor <= BOSS_EVERY; floor++) {
    enemies.next();
    combat.collectRewards();
  }
  assert.equal(enemies.defeated, BOSS_EVERY);
  assert.equal(enemies.bossesDefeated, 1);
  assert.ok(player.gold > 0);
});

// ---------------------------------------------------------------------
console.log('\nProgression data');
// ---------------------------------------------------------------------

test(`a boss stands on every floor divisible by ${BOSS_EVERY}`, () => {
  for (let index = 0; index < 40; index++) {
    const def = buildEnemy(index);
    assert.equal(def.isBoss, def.floor % BOSS_EVERY === 0, `floor ${def.floor}`);
  }
});

test('enemy HP, attack and rewards all increase with depth', () => {
  const normals = [];
  for (let index = 0; index < 30; index++) {
    const def = buildEnemy(index);
    if (!def.isBoss) normals.push(def);
  }
  for (let i = 1; i < normals.length; i++) {
    assert.ok(normals[i].maxHp > normals[i - 1].maxHp, 'HP must grow');
    assert.ok(normals[i].attack >= normals[i - 1].attack, 'attack must not shrink');
    assert.ok(normals[i].gold > normals[i - 1].gold, 'gold must grow');
    assert.ok(normals[i].xp > normals[i - 1].xp, 'xp must grow');
  }
});

test('bosses are tougher and better paid than their neighbours', () => {
  const boss = buildEnemy(BOSS_EVERY - 1);
  const before = buildEnemy(BOSS_EVERY - 2);
  assert.equal(boss.isBoss, true);
  assert.ok(boss.maxHp > before.maxHp * 2, 'boss HP should dwarf a normal enemy');
  assert.ok(boss.countdownMax > before.countdownMax, 'boss gives more warning');
  assert.ok(boss.gold > before.gold * 2);
});

test('every enemy definition points at a real sprite sheet', () => {
  for (let index = 0; index < 40; index++) {
    const def = buildEnemy(index);
    const sheet = def.sheet;
    assert.ok(sheet, `floor ${def.floor} has no sheet`);
    for (const field of ['image', 'frameW', 'frameH', 'cols', 'rows', 'frames', 'footY', 'charH']) {
      assert.ok(sheet[field] !== undefined, `floor ${def.floor} sheet missing ${field}`);
    }
    assert.ok(sheet.frames <= sheet.cols, `${def.name}: frames exceed sheet columns`);
    assert.ok(sheet.row < sheet.rows, `${def.name}: row outside the sheet`);
    assert.ok(sheet.footY <= sheet.frameH, `${def.name}: footY outside the frame`);
  }
});

test('the unit ladder is contiguous and every sprite is described', () => {
  UNITS.forEach((unit, index) => {
    assert.equal(unit.level, index + 1, 'unit levels must be contiguous from 1');
    const sprite = unit.sprite;
    assert.ok(sprite.frames <= sprite.cols, `${unit.name}: frames exceed columns`);
    assert.ok(sprite.row < sprite.rows, `${unit.name}: row outside the sheet`);
    assert.ok(sprite.charH > 0 && sprite.footY > 0, `${unit.name}: bad content box`);
  });
});

test('getUnit keeps working past the named ladder', () => {
  const top = getUnit(UNITS.length);
  const beyond = getUnit(UNITS.length + 3);
  assert.ok(beyond.name);
  assert.equal(beyond.level, UNITS.length + 3);
  assert.equal(beyond.sprite.image, top.sprite.image, 'should reuse the top sprite');
  assert.ok(beyond.stars >= 1, 'ascended units need star pips');
  assert.equal(getUnit(0).level, 1, 'clamps below 1');
});

test('unitPower matches the damage base', () => {
  assert.equal(unitPower(5), 32);
  assert.equal(unitPower(10), 1024);
});

// ---------------------------------------------------------------------
console.log('\nUpgrades + shop');
// ---------------------------------------------------------------------

test('every upgrade and shop item is well formed', () => {
  for (const list of [UPGRADES, SHOP_ITEMS]) {
    for (const item of list) {
      assert.ok(item.id && item.name && item.desc, `${item.id}: missing text`);
      assert.equal(typeof item.apply, 'function', `${item.id}: missing apply`);
      assert.ok(item.icon, `${item.id}: missing icon`);
      assert.ok(item.desc.length <= 40, `${item.id}: description too long for the button`);
    }
  }
  for (const item of SHOP_ITEMS) {
    assert.ok(item.cost > 0, `${item.id}: needs a price`);
  }
});

test('upgrade ids are unique', () => {
  const ids = new Set();
  for (const item of [...UPGRADES, ...SHOP_ITEMS]) {
    assert.equal(ids.has(item.id), false, `duplicate id ${item.id}`);
    ids.add(item.id);
  }
});

test('a level-up roll always offers three distinct upgrades', () => {
  const player = new Player();
  const upgrades = new UpgradeSystem(player);
  for (let i = 0; i < 200; i++) {
    const roll = upgrades.roll(3);
    assert.equal(roll.length, 3);
    assert.equal(new Set(roll.map((u) => u.id)).size, 3);
  }
});

test('applying every upgrade leaves the player in a sane state', () => {
  const player = new Player();
  const upgrades = new UpgradeSystem(player);
  for (const upgrade of UPGRADES) upgrades.apply(upgrade);
  assert.ok(player.hp <= player.maxHp && player.hp > 0);
  assert.ok(player.critChance <= 0.8);
  assert.ok(player.dmgMult > 1 && player.flatAtk > 0);
  assert.equal(player.perks.length, UPGRADES.length);
});

test('the heal upgrade is hidden at full health', () => {
  const player = new Player();
  const heal = UPGRADES.find((u) => u.id === 'heal');
  assert.equal(heal.available(player), false);
  player.takeDamage(10);
  assert.equal(heal.available(player), true);
});

test('the shop refuses purchases the player cannot afford', () => {
  const player = new Player();
  const shop = new ShopSystem(player);
  const offers = shop.roll(3);
  assert.equal(offers.length, 3);
  const offer = offers[0];
  assert.equal(shop.canAfford(offer), false);
  assert.equal(shop.buy(offer), false);
  player.gold = offer.cost;
  assert.equal(shop.buy(offer), true);
  assert.equal(player.gold, 0);
});

test('shop prices rise on later visits', () => {
  const player = new Player();
  const shop = new ShopSystem(player);
  const first = shop.roll(3);
  const later = shop.roll(3);
  const base = (id) => SHOP_ITEMS.find((i) => i.id === id).cost;
  assert.equal(first[0].cost, base(first[0].id));
  assert.ok(later[0].cost > base(later[0].id), 'second visit should cost more');
});

// ---------------------------------------------------------------------
console.log('\nEnemy sabotage (rubble + freeze)');
// ---------------------------------------------------------------------

/** Drop rubble straight into a test grid. */
function rubbleAt(cells, row, col, ttl = 4) {
  const tile = new Tile(0, row, col, 'rubble');
  tile.ttl = ttl;
  cells[row][col] = tile;
  return tile;
}

test('rubble is a wall: tiles slide up to it, never through it', () => {
  const cells = gridFrom([
    [0, 2, 0, 2],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  rubbleAt(cells, 0, 2);
  const result = slide(cells, 'left');
  assert.equal(result.moved, true);
  assert.equal(result.cells[0][0].level, 2);
  assert.equal(result.cells[0][2].kind, 'rubble');
  assert.equal(result.cells[0][3].level, 2, 'the tile behind the wall had nowhere to go');
  assert.equal(result.merges.length, 0, 'equal tiles must not merge across rubble');
});

test('rubble never moves, in any direction', () => {
  for (const dir of ['up', 'down', 'left', 'right']) {
    const cells = gridFrom([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    rubbleAt(cells, 1, 2);
    const result = slide(cells, dir);
    assert.equal(result.moved, false, `rubble moved on ${dir}`);
    assert.equal(result.cells[1][2].kind, 'rubble');
  }
});

test('a frozen unit is immovable and unmergeable', () => {
  const cells = gridFrom([
    [1, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  cells[0][1].frozenFor = 2;
  const result = slide(cells, 'left');
  assert.equal(result.moved, false, 'nothing can move: the pair must not merge');
  assert.equal(result.cells[0][1].frozenFor, 2);
});

test('free tiles still slide within their segment beside a frozen unit', () => {
  const cells = gridFrom([
    [0, 3, 0, 3],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  cells[0][1].frozenFor = 1;
  const result = slide(cells, 'left');
  assert.equal(result.moved, true);
  assert.equal(result.cells[0][1].level, 3, 'frozen tile holds its cell');
  assert.equal(result.cells[0][2].level, 3, 'free tile slides up to the ice');
  assert.equal(result.merges.length, 0);
});

test('hasMoves is false when the only unit is walled in', () => {
  const cells = gridFrom([
    [1, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  rubbleAt(cells, 0, 1);
  rubbleAt(cells, 1, 0);
  assert.equal(hasMoves(cells), false, 'empty cells exist but nothing can reach them');
});

test('hasMoves sees the escape when the wall has a gap', () => {
  const cells = gridFrom([
    [1, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  rubbleAt(cells, 0, 1);
  assert.equal(hasMoves(cells), true);
});

test('rubble ages per tick and crumbles at zero', () => {
  const board = new Board();
  board.cells = gridFrom([
    [1, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 1],
  ]);
  const rubble = board.addRubble(2, 2, 2);
  assert.ok(rubble, 'rubble lands on an empty cell');
  assert.equal(board.addRubble(2, 2, 2), null, 'occupied cells refuse rubble');

  let result = board.tick();
  assert.equal(rubble.ttl, 1);
  assert.equal(result.expired.length, 0);

  result = board.tick();
  assert.equal(result.expired[0], rubble);
  assert.equal(board.get(2, 2), null, 'crumbled rubble frees the cell');
});

test('frozen units thaw after their turns pass', () => {
  const board = new Board();
  const tile = board.freezeRandomUnit(2);
  assert.ok(tile && tile.frozenFor === 2);
  board.tick();
  assert.equal(tile.frozenFor, 1);
  const { thawed } = board.tick();
  assert.equal(thawed[0], tile);
  assert.equal(tile.locked, false);
});

test('killing the enemy clears every debuff at once', () => {
  const board = new Board();
  board.addRubble(...Object.values(board.randomEmptyCell()), 4);
  const frozen = board.freezeRandomUnit(3);
  const { expired, thawed } = board.clearDebuffs();
  assert.equal(expired.length, 1);
  assert.equal(thawed[0], frozen);
  assert.equal(board.tiles().every((t) => !t.locked), true);
});

test('spawns never land on rubble', () => {
  const board = new Board();
  board.cells = gridFrom([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  // wall off everything except one legal cell
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (row === 3 && col === 3) continue;
      rubbleAt(board.cells, row, col);
    }
  }
  const spawned = board.spawn();
  assert.deepEqual({ row: spawned.row, col: spawned.col }, { row: 3, col: 3 });
  assert.equal(board.spawn(), null, 'no free cell left');
});

// ---------------------------------------------------------------------
console.log('\nCombos + enemy intents');
// ---------------------------------------------------------------------

test('combo multiplier escalates by half per chained merge, capped', () => {
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(1), 1.5);
  assert.equal(comboMultiplier(2), 2);
  assert.equal(comboMultiplier(10), COMBO.max);
});

test('a combo merge multiplies the damage dealt', () => {
  const player = new Player();
  player.critChance = 0;
  const enemies = new EnemyManager();
  const combat = new CombatSystem(player, enemies);
  enemies.next();
  enemies.current.hp = 10000;
  enemies.current.maxHp = 10000;

  const plain = combat.resolveMerge(3, 1);
  const chained = combat.resolveMerge(3, 2);
  assert.equal(plain.requested, 8, '2^3 base');
  assert.equal(chained.requested, 16, 'doubled by the combo');
  assert.equal(chained.combo, 2);
});

test('a freeze intent deals no damage and never wastes a shield', () => {
  const player = new Player();
  player.shields = 1;
  const enemies = new EnemyManager();
  const combat = new CombatSystem(player, enemies);
  enemies.next();

  const result = combat.performEnemyAttack('freeze');
  assert.equal(result.dealt, 0);
  assert.equal(result.blocked, false);
  assert.equal(player.shields, 1);
  assert.equal(player.hp, player.maxHp);
});

test('a bomb intent hits for ~65% of a strike', () => {
  const player = new Player();
  player.maxHp = 100000;
  player.hp = 100000;
  const enemies = new EnemyManager();
  const combat = new CombatSystem(player, enemies);
  enemies.next();
  enemies.current.attack = 100;

  const result = combat.performEnemyAttack('bomb');
  assert.ok(result.dealt >= 58 && result.dealt <= 72, `dealt ${result.dealt}`);
});

test('the intent cycles through the pattern, one entry per swing', () => {
  const enemy = new Enemy({ ...buildEnemy(0), pattern: ['strike', 'bomb', 'freeze'] });
  assert.equal(enemy.intent, 'strike');
  enemy.advanceIntent();
  assert.equal(enemy.intent, 'bomb');
  enemy.advanceIntent();
  assert.equal(enemy.intent, 'freeze');
  enemy.advanceIntent();
  assert.equal(enemy.intent, 'strike');
});

test('every pattern in the roster uses known intents', () => {
  const known = new Set(['strike', 'bomb', 'freeze']);
  for (let index = 0; index < 30; index++) {
    const def = buildEnemy(index);
    assert.ok(def.pattern.length >= 1, `${def.name} has an empty pattern`);
    for (const intent of def.pattern) {
      assert.ok(known.has(intent), `${def.name} has unknown intent "${intent}"`);
    }
  }
});

test('every enemy speaks with a defined voice', () => {
  for (let index = 0; index < 30; index++) {
    const def = buildEnemy(index);
    assert.ok(VOICES[def.voice], `${def.name} has unknown voice "${def.voice}"`);
  }
});

test('every voice has a matching visual signature', () => {
  for (const voice of Object.keys(VOICES)) {
    const fx = FAMILY_FX[voice];
    assert.ok(fx, `voice "${voice}" has no FAMILY_FX entry`);
    assert.ok(/^#[0-9a-f]{6}$/i.test(fx.color), `bad color for "${voice}"`);
    assert.ok(['puff', 'shards', 'wisps', 'sparks'].includes(fx.style), `bad style for "${voice}"`);
  }
});

// ---------------------------------------------------------------------
console.log('\nBalance sanity (a scripted run should be survivable)');
// ---------------------------------------------------------------------

test('a greedy auto-player clears several floors without dying instantly', () => {
  const board = new Board();
  const player = new Player();
  const enemies = new EnemyManager();
  const combat = new CombatSystem(player, enemies);
  const upgrades = new UpgradeSystem(player);

  let enemy = enemies.next();
  combat.resetCountdown(enemy);

  const dirs = ['left', 'up', 'right', 'down'];
  let turns = 0;

  // Clone including rubble and frozen state — toLevels() would lose both
  // and make the probe mis-predict which moves are legal.
  const cloneCells = () =>
    board.cells.map((row) =>
      row.map((tile) => {
        if (!tile) return null;
        const copy = new Tile(tile.level, tile.row, tile.col, tile.kind);
        copy.ttl = tile.ttl;
        copy.frozenFor = tile.frozenFor;
        return copy;
      }),
    );

  while (player.alive && board.canMove() && turns < 3000) {
    // pick whichever direction merges the most this turn
    let best = null;
    for (const dir of dirs) {
      const result = slide(cloneCells(), dir);
      if (!result.moved) continue;
      const score = result.merges.reduce((sum, m) => sum + Math.pow(2, m.level), 0);
      if (!best || score > best.score) best = { dir, score };
    }
    if (!best) break;

    const result = board.move(best.dir);
    turns++;

    let killed = false;
    result.merges.forEach((merge, index) => {
      const hit = combat.resolveMerge(merge.level, comboMultiplier(index));
      if (hit?.killed) {
        killed = true;
        board.clearDebuffs();
        const rewards = combat.collectRewards();
        for (let i = 0; i < rewards.levelsGained; i++) {
          upgrades.apply(upgrades.roll(3)[0]);
        }
        enemy = enemies.next();
        combat.resetCountdown(enemy);
      }
    });

    if (!killed) {
      board.tick();
      if (combat.advanceTurn().attacks) {
        // mirror Game.js: the intent decides damage + board sabotage
        const intent = enemies.current.intent;
        combat.performEnemyAttack(intent);
        if (intent === 'bomb') {
          const cell = board.randomEmptyCell();
          if (cell) board.addRubble(cell.row, cell.col, 4);
        } else if (intent === 'freeze') {
          board.freezeRandomUnit(3);
        }
      }
    }
  }

  assert.ok(turns > 20, `run ended after only ${turns} turns`);
  assert.ok(
    enemies.defeated >= 3,
    `a competent player only reached floor ${enemies.floor} (${enemies.defeated} kills)`,
  );
  console.log(
    `      reached floor ${enemies.floor}, ${enemies.defeated} kills, ` +
      `player level ${player.level}, ${turns} turns, highest unit ${board.highestLevel()}`,
  );
});

// ---------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
