import { getUnit } from '../data/units.js';
import { BOSS_EVERY } from '../data/enemies.js';
import { ICON_ZOOM } from '../data/assets.js';
import { INTENT_DAMAGE } from '../combat/CombatSystem.js';
import { ribbonDataUrl, paperDataUrl, RIBBON_ROW, RIBBON_METRICS } from './PackArt.js';

const $ = (id) => document.getElementById(id);

/** Escape user-visible strings that end up in innerHTML. */
function esc(text) {
  return String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/**
 * All DOM: the HUD above and below the board, plus every modal screen.
 *
 * Keeps `#stage` locked to the renderer's design box so the HUD rows sit
 * exactly where the 3D layout expects them.
 */
export class UIManager {
  /**
   * @param {{assets: import('../rendering/AssetManager.js').AssetManager,
   *          save: import('../core/SaveManager.js').SaveManager,
   *          sound: import('../audio/SoundManager.js').SoundManager,
   *          music: import('../audio/Music.js').Music}} deps
   */
  constructor({ assets, save, sound, music }) {
    this.assets = assets;
    this.save = save;
    this.sound = sound;
    this.music = music;

    this.el = {
      root: document.documentElement,
      stage: $('stage'),
      hudEnemy: $('hud-enemy'),
      enemyFloor: $('enemy-floor'),
      enemyName: $('enemy-name'),
      enemyHpBar: $('enemy-hp-bar'),
      enemyHpFill: $('enemy-hp-fill'),
      enemyHpGhost: $('enemy-hp-ghost'),
      enemyHpText: $('enemy-hp-text'),
      countdown: $('enemy-countdown'),

      playerHpFill: $('player-hp-fill'),
      playerHpText: $('player-hp-text'),
      playerHpBar: document.querySelector('.bar-php'),
      playerLevel: $('player-level'),
      playerXpFill: $('player-xp-fill'),
      playerXpText: $('player-xp-text'),
      playerGold: $('player-gold'),
      playerScore: $('player-score'),
      badges: $('player-badges'),

      toasts: $('toasts'),
      hint: $('hint'),
      overlay: $('overlay'),
      pauseBtn: $('btn-pause'),
      loading: $('loading'),
      loadingFill: $('loading-fill'),
      loadingText: $('loading-text'),
    };

    /** Set by Game — fired by the pause button (and the Escape key). */
    this.onPauseRequest = null;

    /** Resolver for whatever modal is currently open. */
    this.pendingResolve = null;
    this.keyChoices = null;

    /**
     * While true, updatePlayer leaves the gold readout alone — a coin
     * flight is animating it, and the number should climb as the coins
     * land rather than jump the moment the reward is banked.
     */
    this.goldHold = false;
    this.goldShown = 0;
    /** Same idea for the XP bar while its motes are in flight. */
    this.xpHold = false;

    /**
     * Elements dressed in composed pack art, keyed by element with the
     * function that repaints them — re-run on resize since the art is
     * composed at the element's exact pixel size.
     */
    this.skinned = new Map();
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this.reskin(), 160);
    });

    this.bindIcons();
    this.installPackUi();
    this.bindPauseButton();
    this.bindModalKeys();
  }

  /** Repaint every still-connected skinned element at its new size. */
  reskin() {
    for (const [el, paint] of this.skinned) {
      if (el.isConnected) paint();
      else this.skinned.delete(el);
    }
  }

  bindIcons() {
    const set = (el, key) => {
      if (el) el.src = this.assets.url(key);
    };
    set($('icon-hp'), 'icon_meat');
    set($('icon-gold'), 'icon_gold');
  }

  /**
   * Skin the DOM chrome with the pack's UI Elements art — currently the
   * round button faces for the pause control. (The big 9-slice button
   * faces were tried and rejected: Chromium ignores image-rendering on
   * border-image scaling, which smears their pixel rims at UI sizes.)
   * Falls back to the flat CSS look when the art is missing.
   */
  installPackUi() {
    const root = this.el.root.style;
    // Single contiguous images — usable straight from their URLs.
    // Absolutised against the page: a relative url() inside a CSS var
    // would resolve against the stylesheet's folder instead.
    if (!this.assets.missing.has('ui_btn_round')) {
      const abs = (key) => new URL(this.assets.url(key), document.baseURI).href;
      root.setProperty('--btn-round', `url("${abs('ui_btn_round')}")`);
      root.setProperty('--btn-round-pressed', `url("${abs('ui_btn_round_pressed')}")`);
      document.body.classList.add('pack-round');
    }
  }

  bindPauseButton() {
    this.el.pauseBtn?.addEventListener('click', () => this.onPauseRequest?.());
  }

  /** 1/2/3 pick a modal choice; Enter/Space triggers the primary action. */
  bindModalKeys() {
    window.addEventListener('keydown', (event) => {
      if (this.el.overlay.classList.contains('hidden')) return;
      const index = { Digit1: 0, Digit2: 1, Digit3: 2 }[event.code];
      if (index !== undefined && this.keyChoices?.[index]) {
        event.preventDefault();
        this.keyChoices[index].click();
      }
    });
  }

  // ---------------------------------------------------------------- //
  // layout
  // ---------------------------------------------------------------- //

  /** @param {{x:number,y:number,width:number,height:number,scale:number}} rect */
  applyStageRect(rect) {
    const style = this.el.root.style;
    style.setProperty('--stage-x', `${rect.x}px`);
    style.setProperty('--stage-y', `${rect.y}px`);
    style.setProperty('--stage-w', `${rect.width}px`);
    style.setProperty('--stage-h', `${rect.height}px`);
    // Must carry a unit: the stylesheet multiplies design units by --u,
    // and `calc(7 * 1)` is invalid where `calc(7 * 1px)` is not.
    style.setProperty('--u', `${rect.scale}px`);
  }

  // ---------------------------------------------------------------- //
  // loading
  // ---------------------------------------------------------------- //

  setLoadProgress(loaded, total) {
    if (this.el.loadingFill) {
      this.el.loadingFill.style.width = `${Math.round((loaded / total) * 100)}%`;
    }
  }

  setLoadMessage(text, isError = false) {
    if (!this.el.loadingText) return;
    this.el.loadingText.textContent = text;
    this.el.loadingText.classList.toggle('error', isError);
  }

  hideLoading() {
    this.el.loading?.classList.add('done');
    setTimeout(() => this.el.loading?.remove(), 450);
  }

  // ---------------------------------------------------------------- //
  // HUD
  // ---------------------------------------------------------------- //

  /** Hide the HUD while the title screen is up (its markup is a stub). */
  setHudVisible(visible) {
    this.el.stage?.classList.toggle('pre-game', !visible);
  }

  /** @param {import('../combat/Enemy.js').Enemy} enemy */
  setEnemy(enemy) {
    this.el.enemyName.textContent = enemy.name;
    this.el.enemyFloor.textContent = `Floor ${enemy.floor}`;
    // Bosses are marked by the ribbon itself: red cloth + the gold
    // glowing name. The floor chip rides with the countdown, so the
    // whole title row belongs to the name.
    this.el.hudEnemy.classList.toggle('is-boss', enemy.isBoss);
    this.paintNameRibbon(enemy.isBoss);
    this.el.enemyHpGhost.style.width = '0%';
    this.updateEnemyHp(enemy);
    this.updateCountdown(enemy);
  }

  /**
   * Dress an element in a pack ribbon, composed at its exact size.
   *
   * The folded tails scale with the plate's height, so the side padding
   * is computed from the measured tail width — a fixed padding lets the
   * text ride up onto the folds.
   */
  paintRibbon(el, row) {
    if (this.assets.missing.has('ui_ribbons')) return;
    el.classList.add('has-ribbon');

    el.style.paddingLeft = '0px';
    el.style.paddingRight = '0px';
    const height = Math.max(1, Math.ceil(el.offsetHeight));
    const tail = Math.ceil((height / RIBBON_METRICS.h) * RIBBON_METRICS.tailW) + Math.max(4, Math.round(height * 0.1));
    el.style.paddingLeft = `${tail}px`;
    el.style.paddingRight = `${tail}px`;

    const width = Math.max(1, Math.ceil(el.offsetWidth));
    const url = ribbonDataUrl(this.assets.get('ui_ribbons').image, {
      row,
      width: width * 2,
      height: height * 2,
    });
    el.style.backgroundImage = `url("${url}")`;
    this.skinned.set(el, () => this.paintRibbon(el, row));
  }

  /** Navy cloth normally, red for bosses. */
  paintNameRibbon(isBoss) {
    this.paintRibbon(this.el.enemyName, isBoss ? RIBBON_ROW.red : RIBBON_ROW.navy);
  }

  /**
   * Dress an element in the pack's slate paper panel (gold filigree
   * corners), composed at its exact size.
   */
  skinPaper(el, { edge = 20 } = {}) {
    if (this.assets.missing.has('ui_paper')) return;
    el.classList.add('pack-paper');
    const width = Math.max(1, Math.ceil(el.offsetWidth));
    const height = Math.max(1, Math.ceil(el.offsetHeight));
    el.style.backgroundImage = `url("${paperDataUrl(this.assets.get('ui_paper').image, {
      width,
      height,
      edge,
    })}")`;
    this.skinned.set(el, () => this.skinPaper(el, { edge }));
  }

  /** @param {import('../combat/Enemy.js').Enemy} enemy */
  updateEnemyHp(enemy, { showGhost = false, previousFraction = 0 } = {}) {
    const fraction = Math.max(0, enemy.hpFraction);
    const percent = fraction * 100;
    this.el.enemyHpFill.style.width = `${percent}%`;
    this.el.enemyHpText.textContent = `${Math.max(0, enemy.hp)} / ${enemy.maxHp}`;
    this.el.enemyHpBar.classList.toggle('is-low', fraction > 0 && fraction <= 0.25);

    if (showGhost && previousFraction > fraction) {
      const ghost = this.el.enemyHpGhost;
      ghost.style.transition = 'none';
      ghost.style.left = `${percent}%`;
      ghost.style.width = `${(previousFraction - fraction) * 100}%`;
      ghost.style.opacity = '1';
      // next frame, let the transition drain it
      requestAnimationFrame(() => {
        ghost.style.transition = '';
        ghost.style.width = '0%';
        ghost.style.opacity = '0';
      });
    }
  }

  /**
   * The countdown chip doubles as the enemy's telegraph: it names what
   * the next swing will actually do, so waiting it out is a choice.
   * @param {import('../combat/Enemy.js').Enemy} enemy
   */
  updateCountdown(enemy) {
    if (!enemy) return;
    const turns = enemy.countdown;
    const intents = {
      strike: { icon: '&#9876;', text: `~${enemy.attack} dmg`, sabotage: false },
      bomb: {
        icon: '&#128163;',
        text: `Bomb ~${Math.max(1, Math.round(enemy.attack * INTENT_DAMAGE.bomb))}`,
        sabotage: true,
      },
      freeze: { icon: '&#10052;', text: 'Freeze', sabotage: true },
    };
    const intent = intents[enemy.intent] ?? intents.strike;
    const label =
      turns <= 0
        ? 'Enemy is <b>attacking!</b>'
        : `<span class="cd-icon">${intent.icon}</span> ${intent.text} in <b>${turns}</b> ${turns === 1 ? 'turn' : 'turns'}`;
    this.el.countdown.querySelector('.countdown-text').innerHTML = label;
    this.el.countdown.classList.toggle('is-imminent', turns <= 1);
    this.el.countdown.classList.toggle('is-sabotage', intent.sabotage);
  }

  /**
   * @param {import('../combat/Player.js').Player} player
   * @param {number} score
   */
  updatePlayer(player, score) {
    const hpFraction = player.maxHp > 0 ? player.hp / player.maxHp : 0;
    this.el.playerHpFill.style.width = `${Math.max(0, hpFraction) * 100}%`;
    this.el.playerHpText.textContent = `${Math.max(0, player.hp)} / ${player.maxHp}`;
    this.el.playerHpBar?.classList.toggle('is-low', hpFraction > 0 && hpFraction <= 0.3);

    if (!this.xpHold) this.setXpDisplay(player.level, player.xp, player.xpToNext);
    if (!this.goldHold) this.setGoldDisplay(player.gold);
    this.el.playerScore.textContent = String(score);

    this.renderBadges(player);
  }

  /** Write level / XP straight into the XP row. */
  setXpDisplay(level, xp, xpToNext) {
    this.el.playerLevel.textContent = `Lv ${level}`;
    const fraction = xpToNext > 0 ? xp / xpToNext : 0;
    this.el.playerXpFill.style.width = `${Math.min(1, Math.max(0, fraction)) * 100}%`;
    this.el.playerXpText.textContent = `${Math.round(xp)} / ${xpToNext} XP`;
  }

  /** Viewport-pixel centre of the XP bar — the motes' destination. */
  xpAnchor() {
    const el = this.el.playerXpFill?.closest('.bar-xp');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height / 2 };
  }

  /** Flash the XP bar as motes land in it. */
  pulseXp() {
    const el = this.el.playerXpFill?.closest('.bar-xp');
    if (!el) return;
    el.classList.remove('is-bump');
    void el.offsetWidth;
    el.classList.add('is-bump');
  }

  /** Write a value straight into the gold readout. */
  setGoldDisplay(value) {
    this.goldShown = Math.max(0, Math.round(value));
    if (this.el.playerGold) this.el.playerGold.textContent = String(this.goldShown);
  }

  /** Viewport-pixel centre of the gold readout — the coins' destination. */
  goldAnchor() {
    const el = this.el.playerGold?.closest('.stat-gold') ?? this.el.playerGold;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  /** Squash the purse as coins land in it. */
  pulseGold() {
    const el = this.el.playerGold?.closest('.stat-gold');
    if (!el) return;
    el.classList.remove('is-bump');
    void el.offsetWidth; // restart the animation
    el.classList.add('is-bump');
  }

  renderBadges(player) {
    const badges = [];
    if (player.dmgMult > 1) badges.push({ text: `DMG +${Math.round((player.dmgMult - 1) * 100)}%` });
    if (player.flatAtk > 0) badges.push({ text: `+${player.flatAtk} HIT` });
    if (player.critChance > 0) badges.push({ text: `CRIT ${Math.round(player.critChance * 100)}%` });
    if (player.countdownBonus > 0) badges.push({ text: `+${player.countdownBonus} TURN` });
    if (player.goldMult > 1) badges.push({ text: `GOLD +${Math.round((player.goldMult - 1) * 100)}%` });
    if (player.xpMult > 1) badges.push({ text: `XP +${Math.round((player.xpMult - 1) * 100)}%` });
    if (player.shields > 0) badges.push({ text: `SHIELD x${player.shields}`, shield: true });

    const signature = badges.map((b) => b.text).join('|');
    if (signature === this.badgeSignature) return;
    const previous = new Set((this.badgeTexts ?? []));
    this.badgeSignature = signature;
    this.badgeTexts = badges.map((b) => b.text);

    this.el.badges.innerHTML = badges
      .map(
        (b) =>
          `<span class="badge${b.shield ? ' is-shield' : ''}${previous.has(b.text) ? '' : ' is-new'}">${esc(b.text)}</span>`,
      )
      .join('');
  }

  /** @param {'default'|'gold'|'xp'|'warn'|'good'} kind */
  toast(text, kind = 'default') {
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = text;
    this.el.toasts.appendChild(node);
    setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 320);
    }, 1250);
    // keep the stack short
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  hideHint() {
    this.el.hint?.classList.add('hidden');
  }

  showHint() {
    this.el.hint?.classList.remove('hidden');
  }

  // ---------------------------------------------------------------- //
  // modals
  // ---------------------------------------------------------------- //

  /**
   * `<img>` for a UI icon, evening out how much of its frame each one
   * actually fills (see ICON_ZOOM).
   */
  iconImg(key, className) {
    const zoom = ICON_ZOOM[key];
    const style = zoom ? ` style="transform:scale(${zoom})"` : '';
    return `<img class="${className}" src="${this.assets.url(key)}" alt=""${style} />`;
  }

  /**
   * @param {string} [modifier] theme class, e.g. 'is-shop' / 'is-levelup'
   * @param {{fullscreen?: boolean}} [opts] fullscreen drops the dialog
   *        framing and lets the panel own the whole viewport (title)
   */
  openPanel(html, modifier = '', { fullscreen = false } = {}) {
    this.el.overlay.classList.toggle('is-fullscreen', fullscreen);
    this.el.overlay.innerHTML = `<div class="panel ${modifier}">${html}</div>`;
    this.el.overlay.classList.remove('hidden');
    return this.el.overlay.firstElementChild;
  }

  /**
   * Shared modal header: heading and blurb on the left, a status chip on
   * the right. The shop and the level-up screen share this structure so
   * they feel like one family, while their chip, icon and colour theme
   * make it obvious at a glance which one you are looking at.
   */
  panelHeader({ icon, title, sub, right = '' }) {
    return `
      <header class="panel-head">
        <div class="head-left">
          ${icon ? this.iconImg(icon, 'head-icon') : ''}
          <div class="head-text">
            <h2 class="head-title">${esc(title)}</h2>
            <div class="head-sub">${esc(sub)}</div>
          </div>
        </div>
        <div class="head-right">${right}</div>
      </header>`;
  }

  closePanel() {
    this.el.overlay.classList.add('hidden');
    this.el.overlay.classList.remove('is-fullscreen');
    this.el.overlay.innerHTML = '';
    this.keyChoices = null;
  }

  get modalOpen() {
    return !this.el.overlay.classList.contains('hidden');
  }

  /**
   * Inline style showing one sprite-sheet frame in a DOM box, cropped to
   * the character rather than the frame: the element is exactly `box`
   * square and the sheet is scaled and offset so the character's content
   * box sits centred inside it.
   *
   * Cropping (rather than showing the whole padded frame and centring it)
   * matters because centring an oversized child inside `overflow: hidden`
   * clips from the scroll origin instead of symmetrically, which lops the
   * sprite off-centre. Sizing from `charH` also means sheets with very
   * different padding — a 320px Lancer frame and a 192px Pawn frame — come
   * out at the same apparent scale.
   *
   * @param {object} sprite sheet descriptor (frameW/frameH/cols/rows/row/footY/charH/centerX)
   * @param {number} box rendered size of the well, in CSS pixels
   * @param {number} [fill] fraction of the well the character should occupy
   */
  spriteCropStyle(sprite, box, fill = 0.86) {
    const target = box * fill;
    const scale = target / sprite.charH;
    const centerX = sprite.centerX ?? sprite.frameW / 2;
    const row = sprite.row ?? 0;
    // Treat the content as a charH-sided square centred on centerX.
    const contentLeft = centerX - sprite.charH / 2;
    const contentTop = sprite.footY - sprite.charH;
    const inset = (box - target) / 2;
    return [
      `width:${box}px`,
      `height:${box}px`,
      `background-image:url('${this.assets.url(sprite.image)}')`,
      `background-size:${sprite.frameW * scale * sprite.cols}px ${sprite.frameH * scale * sprite.rows}px`,
      `background-position:${inset - contentLeft * scale}px ${inset - (row * sprite.frameH + contentTop) * scale}px`,
      'background-repeat:no-repeat',
      'image-rendering:pixelated',
    ].join(';');
  }

  /**
   * One selectable row. `cost` adds a price tag (shop only); the keycap
   * reinforces that slot N is bound to number key N.
   */
  choiceHtml(item, index, { cost = null } = {}) {
    const costHtml =
      cost === null
        ? ''
        : `<span class="c-cost"><img src="${this.assets.url('icon_gold')}" alt="gold" />${cost}</span>`;
    return `
      <button class="choice" data-index="${index}">
        <span class="c-key">${index + 1}</span>
        ${this.iconImg(item.icon, 'c-icon')}
        <span class="c-body">
          <span class="c-name">${esc(item.name)}</span>
          <span class="c-desc">${esc(item.desc)}</span>
        </span>
        ${costHtml}
      </button>`;
  }

  /** Stash (or clear) a deferred browser install prompt. */
  setInstallPrompt(event) {
    this.installPrompt = event;
    const btn = document.getElementById('btn-install');
    if (btn) btn.hidden = !event;
  }

  /**
   * A visual "two of these make one of those" strip built from real unit
   * frames — it explains the core mechanic faster than a sentence can.
   */
  mergeDemoHtml() {
    const recruit = getUnit(1).sprite;
    const swordsman = getUnit(2).sprite;
    // The frame must fit the slot's INNER box (56px minus 3px borders,
    // border-box), or overflow:hidden shaves the tile's edges.
    const box = (sprite, extra = '') =>
      `<span class="demo-slot ${extra}"><span class="sprite-frame" style="${this.spriteCropStyle(
        sprite,
        48,
        0.84,
      )}"></span></span>`;
    return `
      <div class="merge-demo">
        ${box(recruit)}
        <span class="demo-op">+</span>
        ${box(recruit)}
        <span class="demo-op">=</span>
        ${box(swordsman, 'is-result')}
        <span class="demo-op demo-strike">&#9876;</span>
      </div>
      <p class="demo-caption">Two matching units merge &mdash; and the stronger one <b>attacks</b></p>`;
  }

  /** @returns {Promise<void>} resolves when the player presses Start */
  showTitle() {
    const best = this.save.get('bestScore');
    const floor = this.save.get('highestFloor');
    const unit = this.save.get('highestUnit');
    const records =
      best > 0
        ? `<div class="records">
             <span class="rec"><i>Best</i><b>${best}</b></span>
             <span class="rec"><i>Floor</i><b>${floor}</b></span>
             <span class="rec"><i>Unit</i><b>${unit > 0 ? esc(getUnit(unit).name) : '&mdash;'}</b></span>
           </div>`
        : '';

    const panel = this.openPanel(
      `
      <div class="title-inner">
        <div class="title-hero">
          <h1 class="title-main">MERGE KNIGHTS</h1>
          <p class="title-tag">2048 &times; fantasy RPG</p>
        </div>

        <div class="title-body">
          <div class="title-card">
            ${this.mergeDemoHtml()}
          </div>

          <ul class="how-to">
            <li>${this.iconImg('icon_arrow_up', 'ht-icon')}<span>Slide with <b>WASD</b>, <b>arrows</b> or <b>swipe</b></span></li>
            <li>${this.iconImg('icon_swords', 'ht-icon')}<span>Bigger merges hit <b>far</b> harder &mdash; chain them for <b>combos</b></span></li>
            <li>${this.iconImg('icon_shield', 'ht-icon')}<span>A <b>boss</b> guards every ${BOSS_EVERY}th floor</span></li>
          </ul>

          ${records}
        </div>

        <div class="title-actions">
          <button class="btn btn-hero" id="btn-start">&#9876; Start Run</button>
          <button class="btn ghost btn-install" id="btn-install"${this.installPrompt ? '' : ' hidden'}>&#8681; Install app</button>
        </div>
      </div>
    `,
      'is-title',
      { fullscreen: true },
    );
    // Pack chrome: the hero title on a red ribbon (like a boss plate),
    // the explainer cards on slate paper.
    this.paintRibbon(panel.querySelector('.title-main'), RIBBON_ROW.red);
    this.skinPaper(panel.querySelector('.title-card'), { edge: 17 });
    this.skinPaper(panel.querySelector('.how-to'), { edge: 17 });

    return new Promise((resolve) => {
      const start = panel.querySelector('#btn-start');
      this.keyChoices = [start];
      start.addEventListener('click', () => {
        this.closePanel();
        resolve();
      });

      panel.querySelector('#btn-install')?.addEventListener('click', async () => {
        const prompt = this.installPrompt;
        if (!prompt) return;
        // A deferred prompt is single-use, so drop it either way.
        this.setInstallPrompt(null);
        try {
          await prompt.prompt();
        } catch (err) {
          console.warn('[pwa] install prompt failed:', err);
        }
      });

      start.focus();
    });
  }

  /**
   * @param {Array<object>} choices
   * @param {import('../combat/Player.js').Player} player
   * @returns {Promise<object>} the chosen upgrade
   */
  showLevelUp(choices, player) {
    const panel = this.openPanel(
      `
      ${this.panelHeader({
        icon: 'icon_arrow_up',
        title: 'Level Up!',
        sub: 'Choose one reward',
        right: `<div class="level-badge"><span class="lv">Level</span><strong>${player.level}</strong></div>`,
      })}
      <div class="choices">
        ${choices.map((item, i) => this.choiceHtml(item, i)).join('')}
      </div>
      <p class="keyhint">Press 1, 2 or 3 to choose</p>
    `,
      'is-levelup',
    );

    return new Promise((resolve) => {
      const buttons = [...panel.querySelectorAll('.choice')];
      // slot-indexed, matching the "Press 1, 2 or 3" hint
      this.keyChoices = buttons;
      buttons.forEach((button, index) => {
        button.addEventListener('click', () => {
          this.closePanel();
          resolve(choices[index]);
        });
      });
      buttons[0]?.focus();
    });
  }

  /**
   * The post-boss shop. Stays open so several things can be bought.
   * @param {Array<object>} offers
   * @param {import('../combat/Player.js').Player} player
   * @param {(offer:object)=>boolean} onBuy returns true if the purchase went through
   * @returns {Promise<void>}
   */
  showShop(offers, player, onBuy) {
    const panel = this.openPanel(
      `
      ${this.panelHeader({
        icon: 'icon_gold',
        title: 'Camp Merchant',
        sub: 'Spend your spoils',
        right: `<div class="purse">
                  <img src="${this.assets.url('icon_gold')}" alt="gold" />
                  <span id="shop-gold">${player.gold}</span>
                </div>`,
      })}
      <div class="choices">
        ${offers.map((item, i) => this.choiceHtml(item, i, { cost: item.cost })).join('')}
      </div>
      <div class="btn-row">
        <button class="btn" id="btn-continue">Continue &#8594;</button>
      </div>
      <p class="keyhint">Press 1, 2 or 3 to buy &middot; Enter to continue</p>
    `,
      'is-shop',
    );

    const goldLabel = panel.querySelector('#shop-gold');
    const buttons = [...panel.querySelectorAll('.choice')];
    const cont = panel.querySelector('#btn-continue');

    // Number keys address the three slots by position for the whole visit,
    // so "2" cannot turn into Continue once a slot sells out.
    this.keyChoices = buttons;

    /**
     * Repaint prices, affordability and sold state in place. Rebuilding
     * the panel would restart its entrance animation, which reads as the
     * shop having reopened.
     */
    const refresh = () => {
      goldLabel.textContent = String(player.gold);
      buttons.forEach((button, index) => {
        const offer = offers[index];
        const cost = button.querySelector('.c-cost');
        if (offer.sold) {
          button.disabled = true;
          button.classList.add('is-sold');
          button.classList.remove('too-expensive');
          const desc = button.querySelector('.c-desc');
          if (desc) desc.textContent = 'Purchased';
          // Swap the price for a tick rather than removing the tag, so the
          // row keeps its width and nothing reflows under the cursor.
          if (cost && !cost.classList.contains('is-owned')) {
            cost.classList.add('is-owned');
            cost.innerHTML = '&#10003;';
          }
        } else {
          const tooDear = player.gold < offer.cost;
          button.disabled = tooDear;
          button.classList.toggle('too-expensive', tooDear);
        }
      });
    };
    refresh();

    return new Promise((resolve) => {
      buttons.forEach((button, index) => {
        button.addEventListener('animationend', () => button.classList.remove('just-bought'));
        button.addEventListener('click', () => {
          if (button.disabled || offers[index].sold) return;
          if (!onBuy(offers[index])) return;
          offers[index].sold = true;
          refresh();
          // Confirm on the row itself rather than the whole popup.
          button.classList.remove('just-bought');
          void button.offsetWidth; // force the animation to restart
          button.classList.add('just-bought');
        });
      });
      cont.addEventListener('click', () => {
        this.closePanel();
        resolve();
      });
      cont.focus();
    });
  }

  /**
   * Pause menu: resume, sound toggle, restart, quit. The sound toggle
   * lives here now instead of a permanent corner button.
   * @returns {Promise<'resume'|'restart'|'title'>}
   */
  showPause() {
    const soundLabel = () =>
      `&#9835; SFX: <b>${this.save.get('muted') ? 'Off' : 'On'}</b>`;
    const musicLabel = () =>
      `&#119070; Music: <b>${this.save.get('musicMuted') ? 'Off' : 'On'}</b>`;

    const panel = this.openPanel(
      `
      ${this.panelHeader({
        icon: 'icon_swords',
        title: 'Paused',
        sub: 'The enemy waits for your move',
      })}
      <div class="pause-menu">
        <button class="btn" id="btn-resume">&#9654; Resume</button>
        <button class="btn ghost" id="btn-sound-toggle">${soundLabel()}</button>
        <button class="btn ghost" id="btn-music-toggle">${musicLabel()}</button>
        <button class="btn danger" id="btn-restart">&#8635; Restart Run</button>
        <button class="btn ghost" id="btn-quit">Title Screen</button>
      </div>
      <p class="keyhint">Esc or Enter to resume</p>
    `,
      'is-pause',
    );
    this.skinPaper(panel, { edge: 22 });

    return new Promise((resolve) => {
      const done = (choice) => {
        this.closePanel();
        resolve(choice);
      };
      panel.querySelector('#btn-resume').addEventListener('click', () => done('resume'));
      panel.querySelector('#btn-restart').addEventListener('click', () => done('restart'));
      panel.querySelector('#btn-quit').addEventListener('click', () => done('title'));

      const soundBtn = panel.querySelector('#btn-sound-toggle');
      soundBtn.addEventListener('click', () => {
        const muted = !this.save.get('muted');
        this.save.set('muted', muted);
        this.sound.unlock();
        this.sound.setMuted(muted);
        if (!muted) this.sound.play('buy');
        soundBtn.innerHTML = soundLabel();
      });

      const musicBtn = panel.querySelector('#btn-music-toggle');
      musicBtn.addEventListener('click', () => {
        const muted = !this.save.get('musicMuted');
        this.save.set('musicMuted', muted);
        this.music.setMuted(muted);
        musicBtn.innerHTML = musicLabel();
      });

      panel.querySelector('#btn-resume').focus();
    });
  }

  /**
   * @param {{score:number, floor:number, enemies:number, bosses:number,
   *          highestUnit:number, gold:number, reason:string,
   *          record:{newRecord:boolean, previousBest:number}}} summary
   * @returns {Promise<'again'|'title'>}
   */
  showGameOver(summary) {
    const unit = getUnit(summary.highestUnit || 1);
    const unitImg = summary.highestUnit
      ? `<div class="unit-preview">
           <span class="sprite-frame" style="${this.spriteCropStyle(unit.sprite, 78, 0.88)}"></span>
           <div style="text-align:left">
             <div class="unit-preview-name">${esc(unit.name)}</div>
             <div class="unit-preview-sub">Strongest unit &middot; Lv ${summary.highestUnit}</div>
           </div>
         </div>`
      : '';

    const panel = this.openPanel(`
      <h1>GAME OVER</h1>
      <p class="sub">${esc(summary.reason)}</p>
      <div class="score-cap">Score</div>
      <div class="score-big">${summary.score}</div>
      ${summary.record.newRecord ? '<div class="record">&#9733; NEW BEST SCORE &#9733;</div>' : `<div class="keyhint" style="margin:0 0 12px">Best: ${summary.record.previousBest}</div>`}
      ${unitImg}
      <dl class="stats">
        <dt>Floor reached</dt><dd>${summary.floor}</dd>
        <dt>Enemies defeated</dt><dd>${summary.enemies}</dd>
        <dt>Bosses defeated</dt><dd>${summary.bosses}</dd>
        <dt>Highest unit</dt><dd>Lv ${summary.highestUnit}</dd>
        <dt>Gold earned</dt><dd class="hi">${summary.gold}</dd>
      </dl>
      <div class="btn-row">
        <button class="btn" id="btn-again">&#9876; Play Again</button>
        <button class="btn ghost" id="btn-title">Title Screen</button>
      </div>
      <p class="keyhint">Press Enter to play again</p>
    `);

    return new Promise((resolve) => {
      const again = panel.querySelector('#btn-again');
      const title = panel.querySelector('#btn-title');
      this.keyChoices = [again, title];
      again.addEventListener('click', () => {
        this.closePanel();
        resolve('again');
      });
      title.addEventListener('click', () => {
        this.closePanel();
        resolve('title');
      });
      again.focus();
    });
  }

  /** Enter/Space activates the focused-or-primary modal button. */
  confirmModal() {
    if (!this.modalOpen) return false;
    const primary =
      this.el.overlay.querySelector('#btn-resume') ??
      this.el.overlay.querySelector('#btn-again') ??
      this.el.overlay.querySelector('#btn-start') ??
      this.el.overlay.querySelector('#btn-continue');
    if (primary) {
      primary.click();
      return true;
    }
    return false;
  }
}
