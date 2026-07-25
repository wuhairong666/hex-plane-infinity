'use strict';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#game');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;
const SAFE_BOTTOM = 125;

const screens = {
  menu: $('#mainMenu'), story: $('#storyScreen'), launch: $('#launchScreen'),
  core: $('#coreScreen'), database: $('#databaseScreen'), over: $('#gameOverScreen')
};
const hud = $('#hud');
const touchControls = $('#touchControls');
const announcement = $('#announcement');
const toastEl = $('#toast');

const ui = {
  pilotId: $('#pilotId'), threat: $('#threatText'), hpText: $('#hpText'), hpFill: $('#hpFill'),
  xpFill: $('#xpFill'), level: $('#levelText'), score: $('#scoreText'), coreCount: $('#coreCount'),
  bombCount: $('#bombCount'), time: $('#timeText'), coreChoices: $('#coreChoices'),
  coreSlots: $('#coreSlotsText'), launchLine: $('#launchLine'), syncFill: $('#syncFill'),
  syncPercent: $('#syncPercent'), deathSequence: $('#deathSequence'), resultPanel: $('#resultPanel'),
  resultText: $('#resultText'), cloneId: $('#cloneId')
};

const keys = {};
let joyX = 0;
let joyY = 0;
let state = 'menu';
let paused = false;
let lastFrame = 0;
let rafId = 0;
let cloneNumber = Number(localStorage.getItem('infinityPlaneClone') || 1);
let storySeen = localStorage.getItem('infinityPlaneStorySeen') === '1';

let player, bullets, enemyBullets, enemies, particles, drones, echoes, pickups;
let score, level, xp, nextXp, bombs, runTime, spawnClock, bossClock, anomalyClock, selectedCores;
let threatIndex, threatPulse, screenShake, timeScale, bossKills, kills, damageTaken, rewindSnapshot;

const roman = ['I', 'II', 'III', 'IV', 'V', 'Ω'];
const threatConfig = [
  { at: 0, spawn: 0.78, speed: 1.00, hp: 1.00, fire: 1.00 },
  { at: 45, spawn: 0.62, speed: 1.10, hp: 1.18, fire: 1.12 },
  { at: 95, spawn: 0.49, speed: 1.22, hp: 1.42, fire: 1.27 },
  { at: 155, spawn: 0.38, speed: 1.36, hp: 1.78, fire: 1.45 },
  { at: 225, spawn: 0.29, speed: 1.52, hp: 2.20, fire: 1.67 },
  { at: 310, spawn: 0.22, speed: 1.72, hp: 2.85, fire: 1.95 }
];

const stars = Array.from({ length: 130 }, () => ({
  x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.7 + .3,
  v: Math.random() * 75 + 18, a: Math.random() * .65 + .2
}));

const cores = [
  { id: 'rapid', name: '极速装填', tag: '通用 · I', desc: '主炮射击间隔缩短 16%。可重复获得。', can: () => true, apply: () => player.fireInterval *= .84 },
  { id: 'power', name: '高能弹头', tag: '通用 · I', desc: '主炮伤害提高 22%。可重复获得。', can: () => true, apply: () => player.damage *= 1.22 },
  { id: 'hull', name: '纳米维修', tag: '生存 · I', desc: '最大装甲 +14，并立即修复 32 点。', can: () => true, apply: () => { player.maxHp += 14; player.hp = Math.min(player.maxHp, player.hp + 32); } },
  { id: 'laser1', name: '脉冲激光器', tag: '激光 · I', desc: '每 2.8 秒发射一道短促激光。单独获得时威力有限。', can: () => !selectedCores.laser1, apply: () => selectedCores.laser1 = 1 },
  { id: 'laser2', name: '聚焦透镜', tag: '激光 · II', desc: '激光伤害提高 45%，宽度略微增加。', can: () => selectedCores.laser1 && !selectedCores.laser2, apply: () => selectedCores.laser2 = 1 },
  { id: 'laser3', name: '双束阵列', tag: '激光 · III', desc: '激光分裂为两束，但单束伤害降低。', can: () => selectedCores.laser2 && !selectedCores.laser3, apply: () => selectedCores.laser3 = 1 },
  { id: 'laser4', name: '过载反应堆', tag: '激光 · IV', desc: '激光冷却显著缩短，但每次发射损失 1 点装甲。', can: () => selectedCores.laser3 && !selectedCores.laser4, apply: () => selectedCores.laser4 = 1 },
  { id: 'drone1', name: '护航无人机', tag: '无人机 · I', desc: '部署一架自动射击无人机。', can: () => (selectedCores.drone1 || 0) < 3, apply: () => { selectedCores.drone1 = (selectedCores.drone1 || 0) + 1; drones.push({ angle: Math.random() * Math.PI * 2, cooldown: 0 }); } },
  { id: 'droneShield', name: '拦截协议', tag: '无人机 · II', desc: '无人机可周期性拦截附近敌方子弹。', can: () => selectedCores.drone1 && !selectedCores.droneShield, apply: () => selectedCores.droneShield = 1 },
  { id: 'missile', name: '微型追踪弹', tag: '导弹 · I', desc: '每 1.9 秒发射一枚追踪导弹。', can: () => !selectedCores.missile, apply: () => selectedCores.missile = 1 },
  { id: 'chrono', name: '时滞场', tag: '时间 · I', desc: '每 12 秒展开 3 秒时滞场，敌人与敌弹速度降低 55%。', can: () => !selectedCores.chrono, apply: () => selectedCores.chrono = { cooldown: 3, active: 0 } },
  { id: 'rewind', name: '回溯保险', tag: '时间 · II', desc: '受到致命伤时回到 4 秒前，每局一次。', can: () => !selectedCores.rewind, apply: () => selectedCores.rewind = { used: false } },
  { id: 'echo', name: '意识回响', tag: '时间 · II', desc: '每 18 秒召唤一位过去的 Clone 协同作战 7 秒。', can: () => !selectedCores.echo, apply: () => selectedCores.echo = { cooldown: 4 } },
  { id: 'magnet', name: '引力回收器', tag: '资源 · I', desc: '经验数据的吸附范围提高 80%。', can: () => !selectedCores.magnet, apply: () => selectedCores.magnet = 1 },
  { id: 'glass', name: '不稳定增幅器', tag: '风险 · 传奇', legendary: true, desc: '伤害提高 70%，但最大装甲降低 35%。', can: () => !selectedCores.glass, apply: () => { selectedCores.glass = 1; player.damage *= 1.7; player.maxHp *= .65; player.hp = Math.min(player.hp, player.maxHp); } }
];

function hideAllScreens() { Object.values(screens).forEach(el => el.classList.add('hidden')); }
function showScreen(name) { hideAllScreens(); screens[name].classList.remove('hidden'); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function formatTime(seconds) { const m = Math.floor(seconds / 60).toString().padStart(2, '0'); const s = Math.floor(seconds % 60).toString().padStart(2, '0'); return `${m}:${s}`; }

function goMenu() {
  state = 'menu'; paused = false; cancelAnimationFrame(rafId);
  hud.classList.add('hidden'); touchControls.classList.add('hidden'); showScreen('menu');
  drawMenuBackground();
}

function beginFlow() {
  if (storySeen) launchSequence(); else showStory();
}

function showStory() {
  state = 'story'; showScreen('story');
  const roll = $('#storyRoll');
  roll.style.animation = 'none'; void roll.offsetWidth; roll.style.animation = 'storyScroll 48s linear forwards';
  roll.onanimationend = launchSequence;
}

function skipStory() {
  if (state !== 'story') return;
  storySeen = true; localStorage.setItem('infinityPlaneStorySeen', '1'); launchSequence();
}

function launchSequence() {
  storySeen = true; localStorage.setItem('infinityPlaneStorySeen', '1');
  state = 'launch'; showScreen('launch');
  let progress = 0;
  const lines = [[0, 'PILOT SIGNAL DETECTED'], [28, 'RESTORING COMBAT MEMORY'], [62, 'CORE NETWORK CONNECTED'], [86, 'MISSION AUTHORIZED']];
  let lineIndex = 0;
  const timer = setInterval(() => {
    progress += Math.random() * 5 + 2;
    progress = Math.min(100, progress);
    while (lineIndex + 1 < lines.length && progress >= lines[lineIndex + 1][0]) lineIndex++;
    ui.launchLine.textContent = lines[lineIndex][1];
    ui.syncFill.style.width = `${progress}%`; ui.syncPercent.textContent = `${Math.floor(progress)}%`;
    if (progress >= 100) { clearInterval(timer); setTimeout(startGame, 350); }
  }, 55);
}

function resetRun() {
  player = { x: W / 2, y: H - SAFE_BOTTOM - 70, r: 15, speed: 315, hp: 100, maxHp: 100, damage: 11, fireInterval: 180, fireCd: 0, inv: 0, laserCd: 1.5, missileCd: 1.4 };
  bullets = []; enemyBullets = []; enemies = []; particles = []; drones = []; echoes = []; pickups = [];
  score = 0; level = 1; xp = 0; nextXp = 48; bombs = 3; runTime = 0; spawnClock = 0; bossClock = 0;
  anomalyClock = 48 + Math.random() * 25; selectedCores = {}; threatIndex = 0; threatPulse = 0; screenShake = 0;
  timeScale = 1; bossKills = 0; kills = 0; damageTaken = 0; rewindSnapshot = [];
  updateUI();
}

function startGame() {
  resetRun(); hideAllScreens(); hud.classList.remove('hidden'); touchControls.classList.remove('hidden');
  state = 'playing'; paused = false; lastFrame = performance.now();
  announce('MISSION START', 'ENTERING INFINITY RIFT');
  cancelAnimationFrame(rafId); rafId = requestAnimationFrame(loop);
}

function threatForTime(t) {
  let i = 0;
  for (let n = 0; n < threatConfig.length; n++) if (t >= threatConfig[n].at) i = n;
  return i;
}

function updateThreat() {
  const next = threatForTime(runTime);
  if (next !== threatIndex) {
    threatIndex = next; threatPulse = 1.4;
    announce(`THREAT ${roman[threatIndex]}`, threatIndex === 5 ? 'REALITY FAILURE IMMINENT' : 'ENEMY NETWORK ADAPTING');
    screenShake = 15;
  }
}

function enemyTypeByThreat() {
  const roll = Math.random();
  if (threatIndex === 0) return roll < .78 ? 'scout' : 'armor';
  if (threatIndex === 1) return roll < .50 ? 'scout' : roll < .78 ? 'armor' : 'kamikaze';
  if (threatIndex === 2) return roll < .32 ? 'scout' : roll < .58 ? 'armor' : roll < .82 ? 'kamikaze' : 'sniper';
  return roll < .22 ? 'scout' : roll < .48 ? 'armor' : roll < .74 ? 'kamikaze' : 'sniper';
}

function spawnEnemy(type = enemyTypeByThreat()) {
  const cfg = threatConfig[threatIndex];
  const x = 35 + Math.random() * (W - 70);
  const base = { type, x, y: -38, vx: 0, vy: 0, dir: Math.random() < .5 ? -1 : 1, age: 0, fireCd: 1.4, flash: 0, boss: false };
  if (type === 'scout') Object.assign(base, { r: 13, hp: 23 * cfg.hp, maxHp: 23 * cfg.hp, speed: 148 * cfg.speed, score: 22, xp: 7 });
  if (type === 'armor') Object.assign(base, { r: 22, hp: 88 * cfg.hp, maxHp: 88 * cfg.hp, speed: 63 * cfg.speed, score: 52, xp: 13 });
  if (type === 'kamikaze') Object.assign(base, { r: 15, hp: 34 * cfg.hp, maxHp: 34 * cfg.hp, speed: 112 * cfg.speed, score: 38, xp: 10, charge: .8 + Math.random() * .8 });
  if (type === 'sniper') Object.assign(base, { r: 17, hp: 42 * cfg.hp, maxHp: 42 * cfg.hp, speed: 75 * cfg.speed, score: 65, xp: 14, aim: 1.8 / cfg.fire });
  enemies.push(base);
}

function spawnBoss() {
  enemies.push({ type: 'watcher', boss: true, x: W / 2, y: 105, r: 55, hp: 1000 * threatConfig[threatIndex].hp, maxHp: 1000 * threatConfig[threatIndex].hp, dir: 1, age: 0, fireCd: .8, laserCd: 4.3, phase: 1, score: 1500, xp: 100, flash: 0 });
  announce('WATCHER', 'PILOT... I REMEMBER YOU.');
}

function firePlayer() {
  bullets.push({ type: 'bullet', x: player.x, y: player.y - 20, vx: 0, vy: -650, r: 4, damage: player.damage, life: 2 });
}

function fireLaser() {
  const count = selectedCores.laser3 ? 2 : 1;
  const damage = player.damage * (selectedCores.laser2 ? 5.2 : 3.6) / count;
  const offsets = count === 2 ? [-12, 12] : [0];
  offsets.forEach(off => bullets.push({ type: 'laser', x: player.x + off, y: player.y - 330, w: selectedCores.laser2 ? 12 : 7, h: 620, damage, life: .14, hit: new Set() }));
  if (selectedCores.laser4) damagePlayer(1, true);
  screenShake = 5;
}

function fireMissile() {
  bullets.push({ type: 'missile', x: player.x, y: player.y - 18, vx: 0, vy: -250, r: 6, damage: player.damage * 3.2, life: 4, target: null });
}

function enemyShoot(e) {
  const cfg = threatConfig[threatIndex];
  if (e.boss) {
    const phase = e.phase;
    for (let a = -1.05; a <= 1.05; a += phase === 3 ? .22 : .35) enemyBullets.push({ x: e.x, y: e.y + 24, vx: Math.sin(a) * 190 * cfg.fire, vy: Math.cos(a) * 190 * cfg.fire, r: 5, life: 6 });
    return;
  }
  const angle = Math.atan2(player.y - e.y, player.x - e.x);
  const speed = (e.type === 'sniper' ? 310 : 190) * cfg.fire;
  enemyBullets.push({ x: e.x, y: e.y + 8, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: e.type === 'sniper' ? 6 : 5, life: 6 });
}

function spawnPickup(x, y, amount) { pickups.push({ x, y, amount, r: 5, life: 12, pulse: Math.random() * 6 }); }
function addParticles(x, y, amount = 14, color = '#ff7a64') {
  for (let i = 0; i < amount; i++) {
    const a = Math.random() * Math.PI * 2; const s = 35 + Math.random() * 210;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1.5 + Math.random() * 3.5, life: .3 + Math.random() * .55, max: .85, color });
  }
}

function hitEnemy(enemy, amount) {
  enemy.hp -= amount; enemy.flash = .08;
  if (enemy.hp <= 0) { destroyEnemy(enemy); return true; }
  return false;
}

function destroyEnemy(enemy) {
  score += enemy.score; kills++; if (enemy.boss) bossKills++;
  addParticles(enemy.x, enemy.y, enemy.boss ? 65 : enemy.type === 'armor' ? 28 : 16, enemy.boss ? '#bb77ff' : '#ff6b79');
  screenShake = enemy.boss ? 24 : 7;
  const drops = enemy.boss ? 12 : enemy.type === 'armor' ? 3 : 1;
  for (let i = 0; i < drops; i++) spawnPickup(enemy.x + (Math.random() - .5) * 32, enemy.y + (Math.random() - .5) * 22, enemy.xp / drops);
  if (enemy.boss) { bossClock = 0; announce('TARGET ELIMINATED', 'WATCHER SIGNAL LOST'); }
}

function saveRewindSnapshot() {
  if (!selectedCores.rewind || selectedCores.rewind.used) return;
  rewindSnapshot.push({ t: runTime, x: player.x, y: player.y, hp: player.hp });
  while (rewindSnapshot.length && runTime - rewindSnapshot[0].t > 4.2) rewindSnapshot.shift();
}

function damagePlayer(amount, bypassInv = false) {
  if (!bypassInv && player.inv > 0) return;
  if (player.hp - amount <= 0 && selectedCores.rewind && !selectedCores.rewind.used && rewindSnapshot.length) {
    const snap = rewindSnapshot[0]; selectedCores.rewind.used = true;
    player.x = snap.x; player.y = snap.y; player.hp = Math.max(25, snap.hp); player.inv = 2;
    enemyBullets.length = 0; announce('TIME REWOUND', 'FATAL EVENT REJECTED'); return;
  }
  player.hp -= amount; damageTaken += amount; player.inv = .72; screenShake = 13;
  if (player.hp <= 0) endGame();
}

function useBomb() {
  if (state !== 'playing' || paused || bombs <= 0) return;
  bombs--; enemyBullets.length = 0; screenShake = 22;
  enemies.forEach(e => e.hp -= e.boss ? 180 : 260);
  addParticles(player.x, player.y, 70, '#b874ff'); toast(`BOMB REMAINING: ${bombs}`); updateUI();
}

function triggerAnomaly() {
  anomalyClock = 65 + Math.random() * 40;
  announce('ANOMALY DETECTED', 'TIME DISTORTION · 15 SEC');
  selectedCores.anomaly = 15;
}

function updatePlayer(dt) {
  let dx = ((keys.ArrowRight || keys.d || keys.D) ? 1 : 0) - ((keys.ArrowLeft || keys.a || keys.A) ? 1 : 0) + joyX;
  let dy = ((keys.ArrowDown || keys.s || keys.S) ? 1 : 0) - ((keys.ArrowUp || keys.w || keys.W) ? 1 : 0) + joyY;
  const len = Math.hypot(dx, dy) || 1;
  player.x = clamp(player.x + dx / len * player.speed * dt, 22, W - 22);
  player.y = clamp(player.y + dy / len * player.speed * dt, 52, H - SAFE_BOTTOM - 18);
  player.inv = Math.max(0, player.inv - dt);

  player.fireCd -= dt;
  if (player.fireCd <= 0) { firePlayer(); player.fireCd = player.fireInterval / 1000; }

  if (selectedCores.laser1) {
    player.laserCd -= dt;
    if (player.laserCd <= 0) { fireLaser(); player.laserCd = selectedCores.laser4 ? 1.35 : 2.8; }
  }
  if (selectedCores.missile) {
    player.missileCd -= dt;
    if (player.missileCd <= 0) { fireMissile(); player.missileCd = 1.9; }
  }

  if (selectedCores.chrono) {
    selectedCores.chrono.cooldown -= dt;
    if (selectedCores.chrono.active > 0) selectedCores.chrono.active -= dt;
    else if (selectedCores.chrono.cooldown <= 0) { selectedCores.chrono.active = 3; selectedCores.chrono.cooldown = 12; announce('CHRONO FIELD', 'LOCAL TIME -55%'); }
  }

  if (selectedCores.echo) {
    selectedCores.echo.cooldown -= dt;
    if (selectedCores.echo.cooldown <= 0) { selectedCores.echo.cooldown = 18; echoes.push({ x: player.x - 42, y: player.y + 16, life: 7, fireCd: 0 }); announce('CLONE ECHO', 'MEMORY COMBATANT DEPLOYED'); }
  }
}

function updateWeapons(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.life -= dt;
    if (b.type === 'bullet') { b.x += b.vx * dt; b.y += b.vy * dt; }
    if (b.type === 'missile') {
      if (!b.target || b.target.hp <= 0 || !enemies.includes(b.target)) b.target = enemies.reduce((best, e) => !best || distance(b, e) < distance(b, best) ? e : best, null);
      if (b.target) { const a = Math.atan2(b.target.y - b.y, b.target.x - b.x); b.vx += Math.cos(a) * 600 * dt; b.vy += Math.sin(a) * 600 * dt; const s = Math.hypot(b.vx, b.vy); if (s > 390) { b.vx = b.vx / s * 390; b.vy = b.vy / s * 390; } }
      b.x += b.vx * dt; b.y += b.vy * dt;
    }
    if (b.type === 'laser') {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (!b.hit.has(e) && Math.abs(e.x - b.x) < e.r + b.w && e.y > b.y - b.h / 2 && e.y < b.y + b.h / 2) {
          b.hit.add(e); if (hitEnemy(e, b.damage)) enemies.splice(j, 1);
        }
      }
    } else {
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (Math.hypot(b.x - e.x, b.y - e.y) < b.r + e.r) {
          if (hitEnemy(e, b.damage)) enemies.splice(j, 1);
          if (b.type === 'missile') addParticles(b.x, b.y, 18, '#ffb24e');
          bullets.splice(i, 1); break;
        }
      }
    }
    if (b.life <= 0 || b.y < -50 || b.x < -50 || b.x > W + 50) bullets.splice(i, 1);
  }
}

function updateDrones(dt) {
  drones.forEach((d, index) => {
    d.angle += dt * (1.8 + index * .08); d.cooldown -= dt;
    const x = player.x + Math.cos(d.angle) * (38 + index * 4); const y = player.y + Math.sin(d.angle) * 25;
    if (d.cooldown <= 0) { bullets.push({ type: 'bullet', x, y, vx: 0, vy: -560, r: 3, damage: player.damage * .42, life: 2 }); d.cooldown = .55; }
    if (selectedCores.droneShield) {
      for (let i = enemyBullets.length - 1; i >= 0; i--) if (Math.hypot(enemyBullets[i].x - x, enemyBullets[i].y - y) < 18) { enemyBullets.splice(i, 1); addParticles(x, y, 5, '#70edff'); break; }
    }
  });
  for (let i = echoes.length - 1; i >= 0; i--) {
    const e = echoes[i]; e.life -= dt; e.x += (player.x - 46 - e.x) * dt * 5; e.y += (player.y + 10 - e.y) * dt * 5; e.fireCd -= dt;
    if (e.fireCd <= 0) { bullets.push({ type: 'bullet', x: e.x, y: e.y - 12, vx: 0, vy: -620, r: 4, damage: player.damage * .75, life: 2 }); e.fireCd = .24; }
    if (e.life <= 0) echoes.splice(i, 1);
  }
}

function updateEnemies(dt, enemyScale) {
  const cfg = threatConfig[threatIndex];
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i]; e.age += dt; e.flash = Math.max(0, e.flash - dt);
    if (e.boss) {
      e.phase = e.hp / e.maxHp < .35 ? 3 : e.hp / e.maxHp < .68 ? 2 : 1;
      e.x += e.dir * (75 + e.phase * 18) * dt * enemyScale; if (e.x < 72 || e.x > W - 72) e.dir *= -1;
      e.fireCd -= dt * enemyScale; e.laserCd -= dt * enemyScale;
      if (e.fireCd <= 0) { enemyShoot(e); e.fireCd = e.phase === 3 ? .55 : .9; }
      if (e.laserCd <= 0) { enemyBullets.push({ laserWarning: true, x: player.x, y: H / 2, w: 22, h: H, life: .8, damageTime: .18 }); e.laserCd = e.phase === 3 ? 2.7 : 4.2; }
    } else if (e.type === 'scout') {
      e.y += e.speed * dt * enemyScale; e.x += Math.sin(e.age * 4.2) * 65 * dt * enemyScale;
      e.fireCd -= dt * enemyScale; if (e.fireCd <= 0 && threatIndex >= 1) { enemyShoot(e); e.fireCd = 1.8 / cfg.fire; }
    } else if (e.type === 'armor') {
      e.y += e.speed * dt * enemyScale; e.fireCd -= dt * enemyScale; if (e.fireCd <= 0) { enemyShoot(e); e.fireCd = 1.45 / cfg.fire; }
    } else if (e.type === 'kamikaze') {
      const a = Math.atan2(player.y - e.y, player.x - e.x); e.x += Math.cos(a) * e.speed * dt * enemyScale; e.y += Math.sin(a) * e.speed * dt * enemyScale;
      if (e.age > e.charge) e.speed = Math.min(e.speed + 150 * dt, 270 * cfg.speed);
    } else if (e.type === 'sniper') {
      if (e.y < 170) e.y += e.speed * dt * enemyScale; else e.x += Math.sin(e.age * 1.4) * 26 * dt;
      e.aim -= dt * enemyScale; if (e.aim <= 0) { enemyShoot(e); e.aim = 2.2 / cfg.fire; }
    }

    if (distance(e, player) < e.r + player.r) {
      damagePlayer(e.boss ? 24 : e.type === 'kamikaze' ? 28 : 14);
      if (!e.boss) { destroyEnemy(e); enemies.splice(i, 1); continue; }
    }
    if (!e.boss && e.y > H + 50) enemies.splice(i, 1);
  }
}

function updateEnemyBullets(dt, enemyScale) {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i]; b.life -= dt;
    if (b.laserWarning) {
      b.damageTime -= dt;
      if (b.damageTime <= 0 && !b.fired) { b.fired = true; if (Math.abs(player.x - b.x) < b.w / 2 + player.r) damagePlayer(25); screenShake = 18; }
    } else {
      b.x += b.vx * dt * enemyScale; b.y += b.vy * dt * enemyScale;
      if (Math.hypot(b.x - player.x, b.y - player.y) < b.r + player.r) { damagePlayer(10 + threatIndex * 1.5); enemyBullets.splice(i, 1); continue; }
    }
    if (b.life <= 0 || b.y > H + 50 || b.x < -60 || b.x > W + 60) enemyBullets.splice(i, 1);
  }
}

function updatePickups(dt) {
  const range = selectedCores.magnet ? 190 : 100;
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.life -= dt; p.pulse += dt * 5;
    const d = distance(p, player);
    if (d < range) { const a = Math.atan2(player.y - p.y, player.x - p.x); const pull = 180 + (range - d) * 4; p.x += Math.cos(a) * pull * dt; p.y += Math.sin(a) * pull * dt; }
    if (d < player.r + 10) { xp += p.amount; pickups.splice(i, 1); continue; }
    if (p.life <= 0) pickups.splice(i, 1);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .98; p.vy *= .98; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); }
}

function update(dt) {
  runTime += dt; updateThreat(); saveRewindSnapshot();
  if (selectedCores.anomaly) { selectedCores.anomaly -= dt; if (selectedCores.anomaly <= 0) { delete selectedCores.anomaly; announce('ANOMALY ENDED', 'TIMELINE STABILIZED'); } }
  const chronoActive = selectedCores.chrono && selectedCores.chrono.active > 0;
  const enemyScale = chronoActive ? .45 : selectedCores.anomaly ? .62 : 1;
  updatePlayer(dt); updateWeapons(dt); updateDrones(dt); updateEnemies(dt, enemyScale); updateEnemyBullets(dt, enemyScale); updatePickups(dt); updateParticles(dt);

  spawnClock -= dt;
  if (spawnClock <= 0) { spawnEnemy(); if (threatIndex >= 3 && Math.random() < .22) spawnEnemy(); spawnClock = threatConfig[threatIndex].spawn * (.82 + Math.random() * .4); }
  bossClock += dt;
  if (bossClock > 62 && !enemies.some(e => e.boss)) spawnBoss();
  anomalyClock -= dt; if (anomalyClock <= 0 && !selectedCores.anomaly) triggerAnomaly();

  while (xp >= nextXp) { xp -= nextXp; level++; nextXp = Math.floor(nextXp * 1.24 + 8); showCoreSelection(); break; }
  updateUI();
}

function showCoreSelection() {
  paused = true; screens.core.classList.remove('hidden');
  const pool = cores.filter(c => c.can());
  pool.sort(() => Math.random() - .5);
  const picks = pool.slice(0, 3);
  ui.coreChoices.innerHTML = '';
  ui.coreSlots.textContent = `${Object.keys(selectedCores).filter(k => k !== 'anomaly').length} / 8`;
  picks.forEach(core => {
    const button = document.createElement('button');
    button.className = `core-card${core.legendary ? ' legendary' : ''}`;
    button.innerHTML = `<h3>${core.name}</h3><p>${core.desc}</p><span class="core-tag">${core.tag}</span>`;
    button.onclick = () => { core.apply(); screens.core.classList.add('hidden'); paused = false; toast(`CORE ACQUIRED: ${core.name}`); updateUI(); };
    ui.coreChoices.appendChild(button);
  });
}

function updateUI() {
  ui.pilotId.textContent = `#${String(cloneNumber).padStart(6, '0')}`;
  ui.threat.textContent = roman[threatIndex || 0];
  ui.hpText.textContent = `${Math.ceil(Math.max(0, player?.hp || 0))} / ${Math.ceil(player?.maxHp || 100)}`;
  ui.hpFill.style.width = `${clamp((player?.hp || 0) / (player?.maxHp || 100) * 100, 0, 100)}%`;
  ui.xpFill.style.width = `${clamp(xp / nextXp * 100, 0, 100)}%`;
  ui.level.textContent = level || 1; ui.score.textContent = score || 0;
  ui.coreCount.textContent = Object.keys(selectedCores || {}).filter(k => k !== 'anomaly').length;
  ui.bombCount.textContent = bombs ?? 3; ui.time.textContent = formatTime(runTime || 0);
}

function announce(title, subtitle = '') {
  announcement.innerHTML = `${title}<small>${subtitle}</small>`;
  announcement.classList.remove('hidden');
  announcement.style.animation = 'none'; void announcement.offsetWidth; announcement.style.animation = 'announce .9s ease both';
  setTimeout(() => announcement.classList.add('hidden'), 950);
}

function toast(text) {
  toastEl.textContent = text; toastEl.style.opacity = '1'; clearTimeout(toastEl.timer);
  toastEl.timer = setTimeout(() => toastEl.style.opacity = '0', 1500);
}

function endGame() {
  state = 'over'; paused = true; hud.classList.add('hidden'); touchControls.classList.add('hidden'); screens.over.classList.remove('hidden');
  ui.deathSequence.classList.remove('hidden'); ui.resultPanel.classList.add('hidden');
  cloneNumber++; localStorage.setItem('infinityPlaneClone', String(cloneNumber));
  setTimeout(() => {
    ui.deathSequence.classList.add('hidden'); ui.resultPanel.classList.remove('hidden');
    ui.cloneId.textContent = `CLONE ID #${String(cloneNumber).padStart(6, '0')}`;
    const build = selectedCores.laser4 ? '过载激光阵列' : selectedCores.chrono ? '时序操纵者' : selectedCores.drone1 ? '机械蜂群' : selectedCores.missile ? '追踪猎手' : '标准战斗协议';
    ui.resultText.innerHTML = `<div>分数<b>${score}</b></div><div>同步等级<b>${level}</b></div><div>存活时间<b>${formatTime(runTime)}</b></div><div>击毁目标<b>${kills}</b></div><div>Boss 击破<b>${bossKills}</b></div><div>本局 Build<b>${build}</b></div>`;
  }, 4300);
}

function drawBackground() {
  ctx.fillStyle = '#030713'; ctx.fillRect(0, 0, W, H);
  for (const s of stars) { s.y += s.v * .016 * (1 + threatIndex * .08); if (s.y > H) { s.y = 0; s.x = Math.random() * W; } ctx.globalAlpha = s.a; ctx.fillStyle = '#a5eaff'; ctx.fillRect(s.x, s.y, s.r, s.r * 2.2); }
  ctx.globalAlpha = 1;
  const grad = ctx.createRadialGradient(W / 2, H * .25, 10, W / 2, H * .25, W * .8);
  grad.addColorStop(0, `rgba(${35 + threatIndex * 25},${55 - threatIndex * 6},${105 - threatIndex * 7},.16)`); grad.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
}

function drawMenuBackground() { drawBackground(); requestAnimationFrame(() => { if (state === 'menu') drawMenuBackground(); }); }

function drawPlayerShip(x, y, alpha = 1, echo = false) {
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha;
  ctx.shadowColor = echo ? '#b778ff' : '#52e8ff'; ctx.shadowBlur = 18;
  ctx.fillStyle = echo ? '#ab6cff' : '#58ddff';
  ctx.beginPath(); ctx.moveTo(0, -21); ctx.lineTo(-16, 16); ctx.lineTo(-5, 10); ctx.lineTo(0, 17); ctx.lineTo(5, 10); ctx.lineTo(16, 16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#effcff'; ctx.fillRect(-2, -8, 4, 11); ctx.restore();
}

function drawEnemy(e) {
  ctx.save(); ctx.translate(e.x, e.y); if (e.flash > 0) ctx.globalCompositeOperation = 'lighter';
  ctx.shadowBlur = 12; ctx.shadowColor = e.boss ? '#b36cff' : '#ff5574';
  if (e.boss) {
    ctx.strokeStyle = '#be7dff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#733caf'; ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff84c9'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
  } else if (e.type === 'armor') {
    ctx.fillStyle = '#ff9c52'; ctx.fillRect(-20, -18, 40, 34); ctx.fillStyle = '#4a1f28'; ctx.fillRect(-9, -24, 18, 14);
  } else if (e.type === 'kamikaze') {
    ctx.rotate(e.age * 4); ctx.fillStyle = '#ff3f5f'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const r = i % 2 ? 9 : 18; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill();
  } else if (e.type === 'sniper') {
    ctx.fillStyle = '#ff7190'; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(-18, -10); ctx.lineTo(-5, -7); ctx.lineTo(0, -24); ctx.lineTo(5, -7); ctx.lineTo(18, -10); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = `rgba(255,74,111,${clamp(1 - e.aim / 2, .15, .85)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 12); ctx.lineTo(player.x - e.x, player.y - e.y); ctx.stroke();
  } else {
    ctx.fillStyle = '#ff5574'; ctx.beginPath(); ctx.moveTo(0, 17); ctx.lineTo(-13, -13); ctx.lineTo(0, -7); ctx.lineTo(13, -13); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  if (e.boss) { ctx.fillStyle = '#14203a'; ctx.fillRect(60, 55, W - 120, 10); ctx.fillStyle = '#b66cff'; ctx.fillRect(60, 55, (W - 120) * Math.max(0, e.hp / e.maxHp), 10); }
  else if (e.type === 'armor') { ctx.fillStyle = '#1b263b'; ctx.fillRect(e.x - 20, e.y - e.r - 10, 40, 4); ctx.fillStyle = '#ff9754'; ctx.fillRect(e.x - 20, e.y - e.r - 10, 40 * Math.max(0, e.hp / e.maxHp), 4); }
}

function draw() {
  ctx.save();
  if (screenShake > .2) { ctx.translate((Math.random() - .5) * screenShake, (Math.random() - .5) * screenShake); screenShake *= .86; }
  drawBackground();

  for (const p of pickups) { ctx.globalAlpha = .7 + Math.sin(p.pulse) * .25; ctx.fillStyle = '#5eeaff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + Math.sin(p.pulse) * 1.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  for (const p of particles) { ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;

  for (const b of bullets) {
    if (b.type === 'laser') { const g = ctx.createLinearGradient(b.x - b.w, 0, b.x + b.w, 0); g.addColorStop(0, 'rgba(80,235,255,0)'); g.addColorStop(.5, '#eaffff'); g.addColorStop(1, 'rgba(80,235,255,0)'); ctx.fillStyle = g; ctx.fillRect(b.x - b.w, b.y - b.h / 2, b.w * 2, b.h); }
    else if (b.type === 'missile') { ctx.fillStyle = '#ffcf64'; ctx.fillRect(b.x - 3, b.y - 8, 6, 14); }
    else { ctx.fillStyle = '#66e8ff'; ctx.shadowColor = '#66e8ff'; ctx.shadowBlur = 8; ctx.fillRect(b.x - 2, b.y - 10, 4, 15); ctx.shadowBlur = 0; }
  }

  for (const b of enemyBullets) {
    if (b.laserWarning) { ctx.fillStyle = b.fired ? 'rgba(255,56,95,.72)' : 'rgba(255,56,95,.16)'; ctx.fillRect(b.x - b.w / 2, 0, b.w, H); }
    else { ctx.fillStyle = '#ff5272'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); }
  }
  enemies.forEach(drawEnemy);

  drones.forEach((d, index) => { const x = player.x + Math.cos(d.angle) * (38 + index * 4); const y = player.y + Math.sin(d.angle) * 25; ctx.fillStyle = '#8bf3ff'; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); if (selectedCores.droneShield) { ctx.strokeStyle = 'rgba(120,238,255,.55)'; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.stroke(); } });
  echoes.forEach(e => drawPlayerShip(e.x, e.y, clamp(e.life / 2, .25, .7), true));
  if (player) drawPlayerShip(player.x, player.y, player.inv > 0 && Math.floor(player.inv * 16) % 2 ? .28 : 1);

  if (selectedCores.chrono && selectedCores.chrono.active > 0) { ctx.strokeStyle = 'rgba(102,222,255,.55)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(player.x, player.y, 145 + Math.sin(runTime * 8) * 8, 0, Math.PI * 2); ctx.stroke(); }
  if (selectedCores.anomaly) { ctx.fillStyle = 'rgba(113,65,255,.07)'; ctx.fillRect(0, 0, W, H); }
  if (threatPulse > 0) { threatPulse -= .016; ctx.fillStyle = `rgba(255,45,82,${threatPulse * .07})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

function loop(now) {
  if (state !== 'playing') return;
  const dt = Math.min(.033, Math.max(0, (now - lastFrame) / 1000 || 0)); lastFrame = now;
  if (!paused) update(dt);
  draw(); rafId = requestAnimationFrame(loop);
}

addEventListener('keydown', e => {
  keys[e.key] = true;
  if ((e.key === 'b' || e.key === 'B') && state === 'playing') useBomb();
  if ((e.key === 'p' || e.key === 'P') && state === 'playing') paused = !paused;
  if ((e.key === ' ' || e.key === 'Escape') && state === 'story') skipStory();
});
addEventListener('keyup', e => { keys[e.key] = false; });

$('#startBtn').onclick = beginFlow;
$('#storyBtn').onclick = showStory;
$('#skipStory').onclick = skipStory;
$('#databaseBtn').onclick = () => { state = 'database'; showScreen('database'); };
document.querySelectorAll('.back-menu').forEach(btn => btn.onclick = goMenu);
$('#restartBtn').onclick = launchSequence;
$('#returnMenuBtn').onclick = goMenu;
$('#bombBtn').onclick = useBomb;

const joystick = $('#joystick');
const knob = $('#joystickKnob');
function moveJoystick(event) {
  const rect = joystick.getBoundingClientRect(); const p = event.touches ? event.touches[0] : event;
  const dx = p.clientX - (rect.left + rect.width / 2); const dy = p.clientY - (rect.top + rect.height / 2);
  const max = 35; const mag = Math.min(max, Math.hypot(dx, dy)); const a = Math.atan2(dy, dx);
  joyX = Math.cos(a) * mag / max; joyY = Math.sin(a) * mag / max;
  knob.style.transform = `translate(${Math.cos(a) * mag}px, ${Math.sin(a) * mag}px)`;
}
function resetJoystick() { joyX = joyY = 0; knob.style.transform = 'translate(0,0)'; }
joystick.addEventListener('touchstart', moveJoystick, { passive: false });
joystick.addEventListener('touchmove', e => { e.preventDefault(); moveJoystick(e); }, { passive: false });
joystick.addEventListener('touchend', resetJoystick);
joystick.addEventListener('pointerdown', e => { joystick.setPointerCapture(e.pointerId); moveJoystick(e); });
joystick.addEventListener('pointermove', e => { if (e.buttons) moveJoystick(e); });
joystick.addEventListener('pointerup', resetJoystick);

goMenu();
