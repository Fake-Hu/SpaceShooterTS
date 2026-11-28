import "./style.css";
import Phaser from "phaser";
import { GAME_CONFIG } from "./config";
import { BootScene } from "./game/BootScene";
import { GameScene, type InputAction } from "./game/GameScene";
import { SoundManager } from "./sound";
import { GameUI } from "./ui";

const canvas = document.getElementById("gameCanvas") as HTMLCanvasElement;
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

let scoreSavedForCurrentRun = false;

const bootScene = new BootScene();
const gameScene = new GameScene();
gameScene.setDependencies({ sound, ui });

new Phaser.Game({
  type: Phaser.CANVAS,
  canvas,
  width: GAME_CONFIG.CANVAS_WIDTH,
  height: GAME_CONFIG.CANVAS_HEIGHT,
  backgroundColor: "#030712",
  physics: {
    default: "arcade",
    arcade: {
      debug: false
    }
  },
  scene: [bootScene, gameScene]
});

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
    const autoFire = gameScene.isAutoFire();
    settingsAutoFireBtn.textContent = autoFire ? "BẬT" : "TẮT";
    settingsAutoFireBtn.classList.toggle("active", autoFire);
  }
}

function toggleAutoFire(): void {
  gameScene.toggleAutoFire();
  syncSettingsUI();
}

function toggleSound(): void {
  sound.toggleMute();
  syncSettingsUI();
}

function togglePause(): void {
  const state = gameScene.getGameState();
  if (state === "playing") {
    gameScene.pauseGame();
  } else if (state === "paused") {
    gameScene.resumeGame();
  }
}

function startNewGame(): void {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  scoreSavedForCurrentRun = false;
  gameScene.startNewGame();
}

function handleSaveLeaderboardScore(): void {
  if (scoreSavedForCurrentRun) return;
  scoreSavedForCurrentRun = true;

  const summary = gameScene.getRunSummary();
  ui.addLeaderboardEntry(
    playerNameInput.value,
    summary.score,
    summary.wave,
    summary.difficultyLabel
  );
  const topScore = ui.getTopScore();
  ui.updateHUD(summary.score, topScore, summary.wave, 0, summary.maxHp);
  ui.renderLeaderboard(ui.gameOverLeaderboardList);
  ui.renderLeaderboard(ui.startLeaderboardList);

  saveScoreBtn.disabled = true;
  saveScoreBtn.textContent = "ĐÃ LƯU";
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
      gameScene.setInputAction(action, true);
    }

    if (e.code === "KeyF" || (e.key || "").toLowerCase() === "f") {
      toggleAutoFire();
    }

    if (e.code === "KeyM" || (e.key || "").toLowerCase() === "m") {
      toggleSound();
    }

    if (e.code === "KeyP" || e.code === "Escape") {
      const state = gameScene.getGameState();
      if (state === "playing" || state === "paused") {
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
      gameScene.setInputAction(action, false);
    }
  },
  { capture: true }
);

window.addEventListener("blur", () => {
  gameScene.clearInputs();
});

pauseMenuBtn.addEventListener("click", () => {
  const state = gameScene.getGameState();
  if (state === "playing" || state === "paused") {
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
mainMenuFromPauseBtn.addEventListener("click", () => gameScene.returnToMainMenu());
mainMenuFromGameOverBtn.addEventListener("click", () => gameScene.returnToMainMenu());
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
ui.playIntroSplash(1800);
