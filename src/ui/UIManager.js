import { getUnit } from '../data/units.js';
import { BOSS_EVERY } from '../data/enemies.js';

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
   *          sound: import('../audio/SoundManager.js').SoundManager}} deps
   */
  constructor({ assets, save, sound }) {
    this.assets = assets;
    this.save = save;
    this.sound = sound;

    this.el = {
      root: document.documentElement,
      stage: $('stage'),
      hudEnemy: $('hud-enemy'),
      enemyFloor: $('enemy-floor'),
      enemyName: $('enemy-name'),
      enemyLevel: $('enemy-level'),
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
      soundBtn: $('btn-sound'),
      soundIcon: $('icon-sound'),
      loading: $('loading'),
      loadingFill: $('loading-fill'),
      loadingText: $('loading-text'),
    };

    /** Resolver for whatever modal is currently open. */
    this.pendingResolve = null;
    this.keyChoices = null;

    this.bindIcons();
    this.bindSoundButton();
    this.bindModalKeys();
  }

  bindIcons() {
    const set = (el, key) => {
      if (el) el.src = this.assets.url(key);
    };
    set($('icon-hp'), 'icon_meat');
    set($('icon-gold'), 'icon_gold');
    set($('icon-atk'), 'icon_swords');
    set(this.el.soundIcon, 'icon_music');
  }

  bindSoundButton() {
    const btn = this.el.soundBtn;
    if (!btn) return;
    const sync = () => btn.classList.toggle('is-muted', this.save.get('muted'));
    sync();
    btn.addEventListener('click', () => {
      const muted = !this.save.get('muted');
      this.save.set('muted', muted);
      this.sound.unlock();
      this.sound.setMuted(muted);
      if (!muted) this.sound.play('buy');
      sync();
    });
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
    this.el.enemyLevel.textContent = enemy.isBoss ? 'BOSS' : `Lv ${enemy.level}`;
    this.el.hudEnemy.classList.toggle('is-boss', enemy.isBoss);
    this.el.enemyHpGhost.style.width = '0%';
    this.updateEnemyHp(enemy);
    this.updateCountdown(enemy);
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

  /** @param {import('../combat/Enemy.js').Enemy} enemy */
  updateCountdown(enemy) {
    if (!enemy) return;
    const turns = enemy.countdown;
    const label = turns <= 0 ? 'Enemy is <b>attacking!</b>' : `Enemy attacks in <b>${turns}</b> ${turns === 1 ? 'turn' : 'turns'}`;
    this.el.countdown.querySelector('.countdown-text').innerHTML = label;
    this.el.countdown.classList.toggle('is-imminent', turns <= 1);
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

    this.el.playerLevel.textContent = `Lv ${player.level}`;
    const xpFraction = player.xpToNext > 0 ? player.xp / player.xpToNext : 0;
    this.el.playerXpFill.style.width = `${Math.min(1, xpFraction) * 100}%`;
    this.el.playerXpText.textContent = `${player.xp} / ${player.xpToNext} XP`;

    this.el.playerGold.textContent = String(player.gold);
    this.el.playerScore.textContent = String(score);

    this.renderBadges(player);
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

  openPanel(html) {
    this.el.overlay.innerHTML = `<div class="panel">${html}</div>`;
    this.el.overlay.classList.remove('hidden');
    return this.el.overlay.firstElementChild;
  }

  closePanel() {
    this.el.overlay.classList.add('hidden');
    this.el.overlay.innerHTML = '';
    this.keyChoices = null;
  }

  get modalOpen() {
    return !this.el.overlay.classList.contains('hidden');
  }

  /**
   * Inline style that shows a single sprite-sheet frame in a DOM box,
   * by scaling the whole sheet up and offsetting to the wanted cell.
   * @param {{image:string, frameW:number, frameH:number, cols:number, rows:number, row?:number}} sprite
   * @param {number} box rendered size of the frame in CSS pixels
   */
  spriteFrameStyle(sprite, box) {
    const height = box;
    const width = box * (sprite.frameW / sprite.frameH);
    const row = sprite.row ?? 0;
    return [
      `width:${width}px`,
      `height:${height}px`,
      // single quotes: this string lands inside a double-quoted style attribute
      `background-image:url('${this.assets.url(sprite.image)}')`,
      `background-size:${width * sprite.cols}px ${height * sprite.rows}px`,
      `background-position:0px ${-row * height}px`,
      'background-repeat:no-repeat',
      'image-rendering:pixelated',
    ].join(';');
  }

  choiceHtml(item, index, { cost = null, affordable = true } = {}) {
    const costHtml =
      cost === null
        ? ''
        : `<span class="c-cost"><img src="${this.assets.url('icon_gold')}" alt="gold" />${cost}</span>`;
    return `
      <button class="choice" data-index="${index}" ${affordable ? '' : 'disabled'}>
        <img class="c-icon" src="${this.assets.url(item.icon)}" alt="" />
        <span class="c-body">
          <span class="c-name">${esc(item.name)}</span>
          <span class="c-desc">${esc(item.desc)}</span>
        </span>
        ${costHtml}
      </button>`;
  }

  /** @returns {Promise<void>} resolves when the player presses Start */
  showTitle() {
    const best = this.save.get('bestScore');
    const floor = this.save.get('highestFloor');
    const unit = this.save.get('highestUnit');
    const records =
      best > 0
        ? `<dl class="stats">
             <dt>Best score</dt><dd class="hi">${best}</dd>
             <dt>Deepest floor</dt><dd>${floor}</dd>
             <dt>Strongest unit</dt><dd>${unit > 0 ? `${esc(getUnit(unit).name)} (Lv ${unit})` : '&mdash;'}</dd>
           </dl>`
        : '';

    const panel = this.openPanel(`
      <h1>MERGE KNIGHTS</h1>
      <p class="sub">
        Slide with <b>WASD</b>, <b>arrow keys</b> or <b>swipe</b>.<br />
        Merge two matching units &rarr; the stronger unit <b>attacks the enemy</b>.<br />
        Bigger merges hit far harder. Watch the attack countdown.
      </p>
      ${records}
      <div class="btn-row">
        <button class="btn" id="btn-start">&#9876; Start Run</button>
      </div>
      <p class="keyhint">A boss guards every ${BOSS_EVERY}th floor.</p>
    `);

    return new Promise((resolve) => {
      const start = panel.querySelector('#btn-start');
      this.keyChoices = [start];
      start.addEventListener('click', () => {
        this.closePanel();
        resolve();
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
    const panel = this.openPanel(`
      <h2>LEVEL UP!</h2>
      <p class="sub">You are now <b>level ${player.level}</b>. Choose one reward.</p>
      <div class="choices">
        ${choices.map((item, i) => this.choiceHtml(item, i)).join('')}
      </div>
      <p class="keyhint">Press 1, 2 or 3 to choose</p>
    `);

    return new Promise((resolve) => {
      const buttons = [...panel.querySelectorAll('.choice')];
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
    const render = () => `
      <h2>&#128176; Camp Merchant</h2>
      <p class="sub">Boss defeated! You carry <b>${player.gold} gold</b>.</p>
      <div class="choices">
        ${offers
          .map((item, i) =>
            item.sold
              ? `<button class="choice" disabled>
                   <img class="c-icon" src="${this.assets.url(item.icon)}" alt="" />
                   <span class="c-body"><span class="c-name">${esc(item.name)}</span>
                   <span class="c-desc">Purchased</span></span>
                 </button>`
              : this.choiceHtml(item, i, { cost: item.cost, affordable: player.gold >= item.cost }),
          )
          .join('')}
      </div>
      <div class="btn-row">
        <button class="btn" id="btn-continue">Continue &#8594;</button>
      </div>
      <p class="keyhint">Press 1, 2 or 3 to buy &middot; Enter to continue</p>
    `;

    let panel = this.openPanel(render());

    return new Promise((resolve) => {
      const wire = () => {
        const buttons = [...panel.querySelectorAll('.choice:not([disabled])')];
        const cont = panel.querySelector('#btn-continue');
        this.keyChoices = [...buttons, cont];

        for (const button of buttons) {
          const index = Number(button.dataset.index);
          button.addEventListener('click', () => {
            if (onBuy(offers[index])) {
              offers[index].sold = true;
              panel.outerHTML = `<div class="panel">${render()}</div>`;
              panel = this.el.overlay.firstElementChild;
              wire();
            }
          });
        }
        cont.addEventListener('click', () => {
          this.closePanel();
          resolve();
        });
      };
      wire();
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
           <span class="sprite-frame" style="${this.spriteFrameStyle(
             unit.sprite,
             // Size the box so the character itself reads ~62px tall no
             // matter how much transparent padding its sheet carries.
             (62 * unit.sprite.frameH) / unit.sprite.charH,
           )}"></span>
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
