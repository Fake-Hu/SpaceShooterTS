import "./style.css";
import { SpaceBackground } from "./background";
import { GAME_CONFIG } from "./config";
import { Boss, Enemy, EnemyBullet, ExplosionParticle, FloatingText, PowerUp } from "./enemy";
import { Player } from "./player";
import { SoundManager } from "./sound";
import type { BoundingBox, DifficultyConfig, GameState, InputState } from "./types";
import { GameUI } from "./ui";

const GAME_CANVAS_FONT = "Orbitron, Rajdhani, 'Segoe UI', sans-serif";

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const pauseMenuBtn = document.getElementById("pauseMenuBtn") as HTMLButtonElement;
const fullscreenBtn = document.getElementById("fullscreenBtn") as HTMLButtonElement | null;
const openSettingsBtn = document.getElementById("openSettingsBtn") as HTMLButtonElement;
const mainMenuFromPauseBtn = document.getElementById("mainMenuFromPauseBtn") as HTMLButtonElement;
const mainMenuFromGameOverBtn = document.getElementById("mainMenuFromGameOverBtn") as HTMLButtonElement;
const volumeSlider = document.getElementById("volumeSlider") as HTMLInputElement | null;
const volumeValueText = document.getElementById("volumeValueText") as HTMLElement | null;
const settingsMuteBtn = document.getElementById("settingsMuteBtn") as HTMLButtonElement | null;
const settingsAutoFireBtn = document.getElementById("settingsAutoFireBtn") as HTMLButtonElement | null;
const settingsBackBtn = document.getElementById("settingsBackBtn") as HTMLButtonElement;
const saveScoreBtn = document.getElementById("saveScoreBtn") as HTMLButtonElement;
const playerNameInput = document.getElementById("playerNameInput") as HTMLInputElement;

const sound = new SoundManager();
const ui = new GameUI(sound);
const player = new Player();

let gameState: GameState = "start";
let currentDifficulty: DifficultyConfig = GAME_CONFIG.DIFFICULTIES.normal;
let score = 0;
let highScore = ui.getTopScore();
let wave = 1;

let enemies: Enemy[] = [];
let enemyBullets: EnemyBullet[] = [];
let powerUps: PowerUp[] = [];
let particles: ExplosionParticle[] = [];
let floatingTexts: FloatingText[] = [];
const spaceBg = new SpaceBackground(GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.CANVAS_HEIGHT);

let boss: Boss | null = null;
let bossCount = 0;
let nextBossWave = GAME_CONFIG.BOSS.EVERY_WAVES;
let bossWarningUntil = 0;
let scoreSavedForCurrentRun = false;

let lastFrameTime = 0;
let lastEnemySpawnTime = 0;
let isPointerDown = false;

type InputAction = "left" | "right" | "up" | "down" | "shoot";
const activeActions = new Set<InputAction>();

// ===== Khóa hành vi trang web (chặn chuột phải, kéo thả) =====
window.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
  e.preventDefault();
});

// ===== Chế độ Toàn màn hình (Fullscreen API) =====
function isFullscreenSupported(): boolean {
  return Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
}

function updateFullscreenButton(): void {
  if (!fullscreenBtn) return;
  if (!isFullscreenSupported()) {
    fullscreenBtn.style.display = "none";
    return;
  }
  const active = Boolean(document.fullscreenElement);
  fullscreenBtn.classList.toggle("active", active);
  fullscreenBtn.textContent = active ? "⤢" : "⛶";
  fullscreenBtn.title = active ? "Thoát toàn màn hình (F11)" : "Toàn màn hình (F11)";
}

async function toggleFullscreen(): Promise<void> {
  if (!isFullscreenSupported()) return;
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    // Một số trình duyệt mobile từ chối nếu không hợp ngữ cảnh
  }
  updateFullscreenButton();
}

document.addEventListener("fullscreenchange", updateFullscreenButton);
fullscreenBtn?.addEventListener("click", () => {
  void toggleFullscreen();
  fullscreenBtn.blur();
});
updateFullscreenButton();

// ===== Xử lý phím điều khiển (hỗ trợ Unikey/EVKey) =====
function resolveDirectionFromEvent(e: KeyboardEvent): InputAction | null {
  switch (e.code) {
    case "ArrowLeft":
    case "KeyA":
      return "left";
    case "ArrowRight":
    case "KeyD":
      return "right";
    case "ArrowUp":
    case "KeyW":
      return "up";
    case "ArrowDown":
    case "KeyS":
      return "down";
    case "Space":
      return "shoot";
  }

  const k = (e.key || "").toLowerCase();
  if (["a", "â", "ă", "á", "à", "ả", "ã", "ạ"].includes(k)) return "left";
  if (["d", "đ"].includes(k)) return "right";
  if (["w", "ư", "ứ", "ừ", "ử", "ữ", "ự"].includes(k)) return "up";
  if (["s"].includes(k)) return "down";
  if (k === " ") return "shoot";
  return null;
}

function getInputState(): InputState {
  return {
    left: activeActions.has("left"),
    right: activeActions.has("right"),
    up: activeActions.has("up"),
    down: activeActions.has("down"),
    shoot: activeActions.has("shoot") || isPointerDown
  };
}

function syncSettingsUI(): void {
  const volPercent = sound.muted ? 0 : Math.round(sound.masterVolume * 100);
  if (volumeSlider) {
    volumeSlider.value = String(volPercent);
    volumeSlider.disabled = sound.muted;
  }
  if (volumeValueText) volumeValueText.textContent = `${volPercent}%`;
  if (settingsMuteBtn) {
    settingsMuteBtn.textContent = sound.muted ? "BẬT" : "TẮT";
    settingsMuteBtn.classList.toggle("active", sound.muted);
  }
  if (settingsAutoFireBtn) {
    settingsAutoFireBtn.textContent = player.autoFire ? "BẬT" : "TẮT";
    settingsAutoFireBtn.classList.toggle("active", player.autoFire);
  }
}

function toggleAutoFire(): void {
  player.autoFire = !player.autoFire;
  syncSettingsUI();
}

function toggleSound(): void {
  sound.toggleMute();
  syncSettingsUI();
}

function isColliding(a: BoundingBox, b: BoundingBox, padding = 4): boolean {
  return (
    a.x + padding < b.x + b.width - padding &&
    a.x + a.width - padding > b.x + padding &&
    a.y + padding < b.y + b.height - padding &&
    a.y + a.height - padding > b.y + padding
  );
}

function spawnExplosion(x: number, y: number, color: string, count = 12): void {
  for (let i = 0; i < count; i++) {
    particles.push(new ExplosionParticle(x, y, color));
  }
}

function addFloatingText(x: number, y: number, text: string, color = "#ffffff"): void {
  floatingTexts.push(new FloatingText(x, y, text, color));
}

function updateHighScoreIfNeeded(): void {
  if (score > highScore) {
    highScore = score;
    ui.saveHighScore(highScore);
  }
}

function maybeDropPowerUp(x: number, y: number): void {
  if (Math.random() > GAME_CONFIG.POWERUP.DROP_CHANCE) return;

  const roll = Math.random();
  let type: "heal" | "weapon" | "shield" = "weapon";
  if (player.hp < player.maxHp) {
    if (roll < 0.34) type = "heal";
    else if (roll < 0.67) type = "weapon";
    else type = "shield";
  } else {
    if (roll < 0.1) type = "heal";
    else if (roll < 0.55) type = "weapon";
    else type = "shield";
  }
  powerUps.push(new PowerUp(x, y, type));
}

function handlePlayerHit(currentTime: number): boolean {
  const outcome = player.takeDamage(currentTime);
  if (outcome === "shield") {
    ui.achievements.notify("shield_block");
    ui.shake(3, 160);
    sound.playPlayerHit();
    spawnExplosion(player.x + player.width / 2, player.y + player.height / 2, "#22d3ee", 18);
    addFloatingText(player.x + player.width / 2, player.y - 10, "CHẮN ĐÒN!", "#22d3ee");
    return false;
  }
  if (outcome === "damaged") {
    ui.achievements.notify("hit");
    ui.shake(player.hp <= 0 ? 12 : 7, player.hp <= 0 ? 600 : 320);
    if (player.hp <= 0) {
      sound.playExplosion(true);
      sound.playGameOver();
      spawnExplosion(player.x + player.width / 2, player.y + player.height / 2, "#38bdf8", 28);
      triggerGameOver();
      return true;
    }
    sound.playPlayerHit();
    addFloatingText(player.x + player.width / 2, player.y - 10, "-1 MÁU", "#f87171");
  }
  return false;
}

function handleSaveLeaderboardScore(): void {
  if (scoreSavedForCurrentRun) return;
  scoreSavedForCurrentRun = true;

  ui.addLeaderboardEntry(playerNameInput.value, score, wave, currentDifficulty.label);
  highScore = ui.getTopScore();
  ui.updateHUD(score, highScore, wave, 0, player.maxHp);
  ui.renderLeaderboard(ui.gameOverLeaderboardList);
  ui.renderLeaderboard(ui.startLeaderboardList);

  saveScoreBtn.disabled = true;
  saveScoreBtn.textContent = "ĐÃ LƯU";
}

function startNewGame(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  activeActions.clear();
  isPointerDown = false;

  sound.ensureContext();
  currentDifficulty = ui.getSelectedDifficulty();
  player.applyDifficulty(currentDifficulty);
  player.applyShip(ui.getSelectedShip());
  player.reset();

  enemies = [];
  enemyBullets = [];
  powerUps = [];
  particles = [];
  floatingTexts = [];
  spaceBg.reset();

  boss = null;
  bossCount = 0;
  nextBossWave = GAME_CONFIG.BOSS.EVERY_WAVES;
  bossWarningUntil = 0;
  scoreSavedForCurrentRun = false;

  score = 0;
  wave = 1;
  highScore = ui.getTopScore();
  lastEnemySpawnTime = performance.now();
  lastFrameTime = lastEnemySpawnTime;
  gameState = "playing";

  ui.achievements.notify("run_start", { difficulty: currentDifficulty.id });
  ui.updateHUD(score, highScore, wave, player.hp, player.maxHp);
  ui.showScreen("playing");
  const track = sound.startMusic(false);
  ui.updateSideTelemetry("LV 1", "CHỜ", track?.title);
  if (track && track.title) {
    const durationMs = GAME_CONFIG.MUSIC.NOW_PLAYING_DURATION_MS || 3000;
    ui.showNowPlaying(track.title, durationMs);
  }
}

function togglePause(): void {
  activeActions.clear();
  isPointerDown = false;

  if (gameState === "playing") {
    gameState = "paused";
    sound.pauseMusic();
    ui.showScreen("paused");
  } else if (gameState === "paused") {
    gameState = "playing";
    lastFrameTime = performance.now();
    sound.resumeMusic();
    ui.showScreen("playing");
  }
}

function returnToMainMenu(): void {
  activeActions.clear();
  isPointerDown = false;
  gameState = "start";
  sound.stopMusic();
  ui.hideNowPlaying();
  ui.updateSideTelemetry("LV 1", "SẴN SÀNG", "CHỜ KHỞI HÀNH");

  enemies = [];
  enemyBullets = [];
  powerUps = [];
  particles = [];
  floatingTexts = [];
  boss = null;

  highScore = ui.getTopScore();
  ui.updateHUD(0, highScore, 1, player.maxHp, player.maxHp);
  ui.showScreen("start");
}

function triggerGameOver(): void {
  gameState = "gameover";
  activeActions.clear();
  isPointerDown = false;
  sound.stopMusic();
  ui.hideNowPlaying();
  ui.updateSideTelemetry("NGỪNG HOẠT ĐỘNG", "HỎNG", "CHỜ KHỞI HÀNH");

  updateHighScoreIfNeeded();
  ui.updateHUD(score, highScore, wave, 0, player.maxHp);
  ui.showScreen("gameover", {
    score,
    wave,
    difficultyLabel: currentDifficulty.label,
    canSaveLeaderboard: ui.qualifiesForLeaderboard(score)
  });
}

function updateGame(currentTime: number, dtFactor: number): void {
  const didShoot = player.update(getInputState(), currentTime, dtFactor);
  if (didShoot) {
    sound.playShoot(player.weaponLevel);
  }

  wave = Math.floor(score / 100) + 1;

  if (wave >= nextBossWave && !boss) {
    bossCount += 1;
    boss = new Boss(wave, bossCount, currentDifficulty);
    bossWarningUntil = currentTime + 2200;
    ui.shake(4, 500);
    sound.playBossWarning();
    sound.setBossMusic(true);
  }

  if (!boss) {
    const baseInterval = Math.max(
      GAME_CONFIG.ENEMY.MIN_SPAWN_MS,
      GAME_CONFIG.ENEMY.BASE_SPAWN_MS - (wave - 1) * 85
    );
    const spawnInterval = baseInterval * currentDifficulty.spawnRateMul;

    if (currentTime - lastEnemySpawnTime >= spawnInterval) {
      const zigzagChance = Math.min(0.45, 0.12 + (wave - 1) * 0.05);
      const type = Math.random() < zigzagChance ? "zigzag" : "basic";
      enemies.push(new Enemy(type, wave, currentDifficulty));
      lastEnemySpawnTime = currentTime;
    }
  }

  for (const enemy of enemies) {
    enemy.update(dtFactor);
  }
  if (boss) {
    boss.update(currentTime, dtFactor, player, enemyBullets);
  }
  for (const eb of enemyBullets) {
    eb.update(dtFactor);
  }
  for (const p of powerUps) {
    p.update(dtFactor);
  }

  for (const bullet of player.bullets) {
    if (!bullet.active) continue;

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      if (isColliding(bullet, enemy, 2)) {
        bullet.active = false;
        const destroyed = enemy.hit();
        const ex = enemy.x + enemy.width / 2;
        const ey = enemy.y + enemy.height / 2;

        if (destroyed) {
          ui.achievements.notify("kill");
          score += enemy.scoreValue;
          updateHighScoreIfNeeded();
          const color = enemy.type === "zigzag" ? "#c084fc" : "#f97316";
          spawnExplosion(ex, ey, color, 14);
          sound.playExplosion(false);
          addFloatingText(ex, ey - 8, `+${enemy.scoreValue}`, "#fde047");
          maybeDropPowerUp(ex, ey);
        } else {
          spawnExplosion(bullet.x, bullet.y, "#fde047", 5);
          sound.playHit();
        }
        break;
      }
    }

    if (bullet.active && boss && boss.active && boss.state === "fighting") {
      if (isColliding(bullet, boss, 4)) {
        bullet.active = false;
        const bossDied = boss.hit(currentTime);
        if (bossDied) {
          const bx = boss.x + boss.width / 2;
          const by = boss.y + boss.height / 2;
          ui.achievements.notify("boss_kill");
          ui.shake(9, 500);
          score += boss.scoreValue;
          updateHighScoreIfNeeded();
          nextBossWave += GAME_CONFIG.BOSS.EVERY_WAVES;

          spawnExplosion(bx, by, "#f97316", 36);
          spawnExplosion(bx, by, "#fde047", 24);
          sound.playExplosion(true);
          addFloatingText(bx, by, `BOSS +${boss.scoreValue}`, "#facc15");

          powerUps.push(new PowerUp(bx - 24, by, "heal"));
          powerUps.push(new PowerUp(bx + 24, by, Math.random() < 0.5 ? "weapon" : "shield"));
          boss = null;
          sound.setBossMusic(false);
        } else {
          spawnExplosion(bullet.x, bullet.y, "#fde047", 4);
          sound.playHit();
        }
      }
    }
  }

  for (const enemy of enemies) {
    if (!enemy.active) continue;
    if (isColliding(player, enemy, 6)) {
      enemy.active = false;
      spawnExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, "#ef4444", 16);
      if (handlePlayerHit(currentTime)) return;
    }
  }

  for (const eb of enemyBullets) {
    if (!eb.active) continue;
    if (isColliding(player, eb, 4)) {
      eb.active = false;
      spawnExplosion(eb.x + eb.radius, eb.y + eb.radius, eb.color, 8);
      if (handlePlayerHit(currentTime)) return;
    }
  }

  if (boss && boss.active && isColliding(player, boss, 8)) {
    if (handlePlayerHit(currentTime)) return;
  }

  for (const item of powerUps) {
    if (!item.active) continue;
    if (isColliding(player, item, 2)) {
      item.active = false;
      const ix = item.x + item.width / 2;
      const iy = item.y + item.height / 2;
      sound.playPowerUp(item.type);
      ui.achievements.notify("powerup");

      if (item.type === "heal") {
        const healed = player.heal(1);
        addFloatingText(ix, iy, healed ? "+1 MÁU" : "ĐẦY MÁU", "#4ade80");
      } else if (item.type === "weapon") {
        const lv = player.upgradeWeapon(currentTime);
        addFloatingText(ix, iy, `ĐẠN ${lv} TIA`, "#facc15");
      } else if (item.type === "shield") {
        player.activateShield(currentTime);
        addFloatingText(ix, iy, "KHIÊN BẢO VỆ", "#22d3ee");
      }
    }
  }

  enemies = enemies.filter((e) => e.active);
  enemyBullets = enemyBullets.filter((b) => b.active);
  powerUps = powerUps.filter((p) => p.active);

  for (const pt of particles) {
    pt.update(dtFactor);
  }
  particles = particles.filter((pt) => pt.alpha > 0);

  for (const ft of floatingTexts) {
    ft.update(dtFactor);
  }
  floatingTexts = floatingTexts.filter((ft) => ft.alpha > 0);

  const shieldActive = player.hasShield(currentTime);
  const shieldSec = shieldActive ? Math.ceil((player.shieldUntil - currentTime) / 1000) : 0;
  ui.updateSideTelemetry(
    `TIA ${player.weaponLevel}`,
    shieldActive ? `BẬT (${shieldSec}s)` : "CHỜ"
  );
  ui.updateHUD(score, highScore, wave, player.hp, player.maxHp);
}

function drawActivePowerUpIndicators(currentTime: number): void {
  const badges: Array<{ text: string; color: string }> = [];
  if (player.weaponLevel > 1 && currentTime < player.weaponBoostUntil) {
    const sec = Math.ceil((player.weaponBoostUntil - currentTime) / 1000);
    badges.push({ text: `Đạn ${player.weaponLevel} tia: ${sec}s`, color: "#facc15" });
  }
  if (player.hasShield(currentTime)) {
    const sec = Math.ceil((player.shieldUntil - currentTime) / 1000);
    badges.push({ text: `Khiên: ${sec}s`, color: "#22d3ee" });
  }
  if (badges.length === 0) return;

  ctx.save();
  ctx.font = `bold 10px ${GAME_CANVAS_FONT}`;
  ctx.textAlign = "left";
  let y = GAME_CONFIG.CANVAS_HEIGHT - 14;
  for (let i = badges.length - 1; i >= 0; i--) {
    const b = badges[i];
    const textW = ctx.measureText(b.text).width;
    ctx.fillStyle = "rgba(2, 6, 23, 0.84)";
    ctx.fillRect(10, y - 13, textW + 14, 18);
    ctx.strokeStyle = b.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(10, y - 13, textW + 14, 18);
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, 17, y);
    y -= 22;
  }
  ctx.restore();
}

function drawBossWarning(currentTime: number): void {
  if (currentTime >= bossWarningUntil) return;
  if (Math.floor(currentTime / 180) % 2 === 0) return;

  ctx.save();
  ctx.fillStyle = "rgba(127, 29, 29, 0.86)";
  ctx.fillRect(32, GAME_CONFIG.CANVAS_HEIGHT * 0.28, GAME_CONFIG.CANVAS_WIDTH - 64, 46);
  ctx.strokeStyle = "#f87171";
  ctx.lineWidth = 2;
  ctx.strokeRect(32, GAME_CONFIG.CANVAS_HEIGHT * 0.28, GAME_CONFIG.CANVAS_WIDTH - 64, 46);

  ctx.fillStyle = "#fef08a";
  ctx.font = `bold 14px ${GAME_CANVAS_FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CẢNH BÁO: BOSS SẮP XUẤT HIỆN!", GAME_CONFIG.CANVAS_WIDTH / 2, GAME_CONFIG.CANVAS_HEIGHT * 0.28 + 23);
  ctx.restore();
}

function drawGame(currentTime: number, dtFactor: number): void {
  ctx.clearRect(0, 0, GAME_CONFIG.CANVAS_WIDTH, GAME_CONFIG.CANVAS_HEIGHT);

  spaceBg.updateAndDraw(ctx, dtFactor, gameState === "playing");

  if (gameState === "playing" || gameState === "paused") {
    for (const item of powerUps) {
      item.draw(ctx);
    }
    for (const enemy of enemies) {
      enemy.draw(ctx);
    }
    if (boss) {
      boss.draw(ctx, currentTime);
    }
    for (const eb of enemyBullets) {
      eb.draw(ctx);
    }
    player.draw(ctx, currentTime);
    for (const pt of particles) {
      pt.draw(ctx);
    }
    for (const ft of floatingTexts) {
      ft.draw(ctx);
    }

    drawActivePowerUpIndicators(currentTime);
    drawBossWarning(currentTime);
  }
}

function gameLoop(currentTime: number): void {
  if (!lastFrameTime) lastFrameTime = currentTime;
  const deltaMs = Math.min(50, currentTime - lastFrameTime);
  lastFrameTime = currentTime;

  const dtFactor = deltaMs / 16.67;

  if (gameState === "playing") {
    updateGame(currentTime, dtFactor);
  }
  drawGame(currentTime, dtFactor);

  requestAnimationFrame(gameLoop);
}

window.addEventListener(
  "keydown",
  (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }

    const action = resolveDirectionFromEvent(e);
    if (action) {
      e.preventDefault();
      activeActions.add(action);
    }

    if (e.code === "KeyF" || (e.key || "").toLowerCase() === "f") {
      toggleAutoFire();
    }

    if (e.code === "KeyM" || (e.key || "").toLowerCase() === "m") {
      toggleSound();
    }

    if (e.code === "KeyP" || e.code === "Escape") {
      if (gameState === "playing" || gameState === "paused") {
        togglePause();
      }
    }
  },
  { capture: true }
);

window.addEventListener(
  "keyup",
  (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
      return;
    }

    const action = resolveDirectionFromEvent(e);
    if (action) {
      activeActions.delete(action);
    }
  },
  { capture: true }
);

window.addEventListener("blur", () => {
  activeActions.clear();
  isPointerDown = false;
});

function getCanvasCoordinates(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = GAME_CONFIG.CANVAS_WIDTH / rect.width;
  const scaleY = GAME_CONFIG.CANVAS_HEIGHT / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

canvas.addEventListener("pointerdown", (e) => {
  if (gameState !== "playing") return;
  sound.ensureContext();
  isPointerDown = true;
  const pos = getCanvasCoordinates(e.clientX, e.clientY);
  player.moveTo(pos.x, pos.y);
});

canvas.addEventListener("pointermove", (e) => {
  if (gameState !== "playing" || !isPointerDown) return;
  const pos = getCanvasCoordinates(e.clientX, e.clientY);
  player.moveTo(pos.x, pos.y);
});

window.addEventListener("pointerup", () => {
  isPointerDown = false;
});

pauseMenuBtn.addEventListener("click", () => {
  if (gameState === "playing" || gameState === "paused") {
    togglePause();
  }
  pauseMenuBtn.blur();
});
openSettingsBtn.addEventListener("click", () => {
  syncSettingsUI();
  ui.showScreen("settings");
  openSettingsBtn.blur();
});
settingsBackBtn.addEventListener("click", () => {
  ui.showScreen("paused");
  settingsBackBtn.blur();
});
volumeSlider?.addEventListener("input", () => {
  if (sound.muted) {
    volumeSlider.value = "0";
    if (volumeValueText) volumeValueText.textContent = "0%";
    return;
  }
  const val = Number(volumeSlider.value) / 100;
  sound.setMasterVolume(val);
  if (volumeValueText) volumeValueText.textContent = `${Math.round(val * 100)}%`;
});
settingsMuteBtn?.addEventListener("click", () => {
  toggleSound();
  settingsMuteBtn.blur();
});
settingsAutoFireBtn?.addEventListener("click", () => {
  toggleAutoFire();
  settingsAutoFireBtn.blur();
});
mainMenuFromPauseBtn.addEventListener("click", returnToMainMenu);
mainMenuFromGameOverBtn.addEventListener("click", returnToMainMenu);
saveScoreBtn.addEventListener("click", handleSaveLeaderboardScore);
playerNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleSaveLeaderboardScore();
  }
});

document.getElementById("startBtn")?.addEventListener("click", startNewGame);
document.getElementById("resumeBtn")?.addEventListener("click", togglePause);
document.getElementById("restartBtn")?.addEventListener("click", startNewGame);

// Đăng ký Service Worker cho PWA (khi chạy qua HTTP/HTTPS)
if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// Khởi tạo giao diện ban đầu
syncSettingsUI();
ui.updateHUD(0, highScore, 1, player.maxHp, player.maxHp);
ui.playIntroSplash(1800);
requestAnimationFrame(gameLoop);
