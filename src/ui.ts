import { GAME_CONFIG } from "./config";
import { drawShipShape, SHIP_MODELS, SHIP_STORAGE_KEY } from "./ships";
import type { SoundManager } from "./sound";
import type {
  Achievement,
  AchievementRunState,
  AchievementStats,
  DifficultyConfig,
  DifficultyId,
  LeaderboardEntry,
  ScreenState,
  ShipId,
  ShipModel
} from "./types";

const ACH_STORAGE_KEY = "space_shooter_cntt_achievements_v1";
const ACH_STATS_KEY = "space_shooter_cntt_stats_v1";
const SHAKE_STORAGE_KEY = "space_shooter_cntt_shake";

export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_kill", icon: "🎯", title: "Phát súng đầu tiên", desc: "Hạ 1 kẻ địch", test: (st) => st.kills >= 1 },
  { id: "kills_100", icon: "💥", title: "Thợ săn", desc: "Hạ tổng cộng 100 kẻ địch", test: (st) => st.kills >= 100 },
  { id: "boss_slayer", icon: "👾", title: "Diệt Boss", desc: "Hạ Boss lần đầu", test: (st) => st.bosses >= 1 },
  { id: "score_500", icon: "⭐", title: "Điểm cao", desc: "Đạt 500 điểm trong một ván", test: (_st, run) => run.score >= 500 },
  { id: "untouchable", icon: "🛡️", title: "Bất khả xâm phạm", desc: "Đạt Đợt 4 mà không mất máu", test: (_st, run) => run.wave >= 4 && !run.hit },
  { id: "shield_master", icon: "🔰", title: "Bậc thầy khiên", desc: "Chắn 5 đòn bằng khiên", test: (st) => st.blocks >= 5 },
  { id: "collector", icon: "🎁", title: "Nhà sưu tầm", desc: "Nhặt 15 vật phẩm", test: (st) => st.powerups >= 15 },
  { id: "hard_300", icon: "🔥", title: "Bất khuất", desc: "Đạt 300 điểm ở độ khó Khó", test: (_st, run) => run.difficulty === "hard" && run.score >= 300 }
];

export type AchievementEvent = "run_start" | "kill" | "boss_kill" | "powerup" | "shield_block" | "hit";

export class AchievementManager {
  private onUnlock: (achievement: Achievement) => void;
  unlocked: Record<string, boolean>;
  stats: AchievementStats;
  run: AchievementRunState;

  constructor(onUnlock: (achievement: Achievement) => void) {
    this.onUnlock = onUnlock;
    this.unlocked = this.load<Record<string, boolean>>(ACH_STORAGE_KEY, {});
    this.stats = Object.assign(
      { kills: 0, bosses: 0, powerups: 0, blocks: 0, games: 0 },
      this.load<Partial<AchievementStats>>(ACH_STATS_KEY, {})
    );
    this.run = { score: 0, wave: 1, hit: false, difficulty: "normal" };
  }

  private load<T extends object>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : fallback;
      return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
    } catch {
      return fallback;
    }
  }

  save(): void {
    try {
      localStorage.setItem(ACH_STORAGE_KEY, JSON.stringify(this.unlocked));
      localStorage.setItem(ACH_STATS_KEY, JSON.stringify(this.stats));
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage
    }
  }

  notify(eventName: AchievementEvent, data: { difficulty?: DifficultyId } = {}): void {
    if (eventName === "run_start") {
      this.run = { score: 0, wave: 1, hit: false, difficulty: data.difficulty ?? "normal" };
      this.stats.games += 1;
    } else if (eventName === "kill") {
      this.stats.kills += 1;
    } else if (eventName === "boss_kill") {
      this.stats.bosses += 1;
    } else if (eventName === "powerup") {
      this.stats.powerups += 1;
    } else if (eventName === "shield_block") {
      this.stats.blocks += 1;
    } else if (eventName === "hit") {
      this.run.hit = true;
    }
    this.evaluate(true);
  }

  trackProgress(score: number, wave: number): void {
    this.run.score = score;
    this.run.wave = wave;
    this.evaluate(false);
  }

  private evaluate(persist: boolean): void {
    let changed = persist;
    for (const a of ACHIEVEMENTS) {
      if (this.unlocked[a.id]) continue;
      if (a.test(this.stats, this.run)) {
        this.unlocked[a.id] = true;
        changed = true;
        this.onUnlock(a);
      }
    }
    if (changed) this.save();
  }

  count(): number {
    return ACHIEVEMENTS.filter((a) => this.unlocked[a.id]).length;
  }
}

export interface GameOverSummary {
  score?: number;
  wave?: number;
  difficultyLabel?: string;
  canSaveLeaderboard?: boolean;
}

export class GameUI {
  private sound?: SoundManager;

  scoreDisplay = document.getElementById("scoreDisplay") as HTMLElement;
  highScoreDisplay = document.getElementById("highScoreDisplay") as HTMLElement;
  waveDisplay = document.getElementById("waveDisplay") as HTMLElement;
  hpBarFill = document.getElementById("hpBarFill") as HTMLElement;
  hpText = document.getElementById("hpText") as HTMLElement;
  pauseMenuBtn = document.getElementById("pauseMenuBtn") as HTMLButtonElement | null;
  fullscreenBtn = document.getElementById("fullscreenBtn") as HTMLButtonElement | null;

  introScreen = document.getElementById("introScreen") as HTMLElement | null;
  resetPromptScreen = document.getElementById("resetPromptScreen") as HTMLElement | null;
  resetPromptSummary = document.getElementById("resetPromptSummary") as HTMLElement | null;
  keepProgressBtn = document.getElementById("keepProgressBtn") as HTMLButtonElement | null;
  confirmResetBtn = document.getElementById("confirmResetBtn") as HTMLButtonElement | null;
  startScreen = document.getElementById("startScreen") as HTMLElement;
  pauseScreen = document.getElementById("pauseScreen") as HTMLElement;
  settingsScreen = document.getElementById("settingsScreen") as HTMLElement | null;
  gameOverScreen = document.getElementById("gameOverScreen") as HTMLElement;

  difficultyButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#difficultyGroup .btn-diff"));
  selectedDifficultyId: DifficultyId = "normal";

  finalScoreText = document.getElementById("finalScoreText") as HTMLElement;
  finalWaveText = document.getElementById("finalWaveText") as HTMLElement;
  finalDifficultyText = document.getElementById("finalDifficultyText") as HTMLElement;

  nameEntryBox = document.getElementById("nameEntryBox") as HTMLElement;
  playerNameInput = document.getElementById("playerNameInput") as HTMLInputElement;
  saveScoreBtn = document.getElementById("saveScoreBtn") as HTMLButtonElement;

  startLeaderboardList = document.getElementById("startLeaderboardList") as HTMLOListElement | null;
  gameOverLeaderboardList = document.getElementById("gameOverLeaderboardList") as HTMLOListElement | null;

  canvasContainer = document.querySelector<HTMLElement>(".canvas-container");
  achScreen = document.getElementById("achievementsScreen") as HTMLElement;
  achList = document.getElementById("achList") as HTMLUListElement;
  achCountText = document.getElementById("achCountText") as HTMLElement;
  achToast = document.getElementById("achToast") as HTMLElement;
  musicToast = document.getElementById("musicToast") as HTMLElement | null;
  private musicToastTimer: number | null = null;

  achOpenBtn = document.getElementById("achOpenBtn") as HTMLButtonElement;
  leaderboardScreen = document.getElementById("leaderboardScreen") as HTMLElement | null;
  leaderboardOpenBtn = document.getElementById("leaderboardOpenBtn") as HTMLButtonElement | null;
  guideScreen = document.getElementById("guideScreen") as HTMLElement | null;
  guideOpenBtn = document.getElementById("guideOpenBtn") as HTMLButtonElement | null;
  resetProgressBtn = document.getElementById("resetProgressBtn") as HTMLButtonElement | null;
  shipGroup = document.getElementById("shipGroup") as HTMLElement | null;

  // Các phần tử telemetry ở viền máy Arcade trên màn hình PC
  sideShipName = document.getElementById("sideShipName") as HTMLElement | null;
  sideDiffLabel = document.getElementById("sideDiffLabel") as HTMLElement | null;
  sideWeaponStatus = document.getElementById("sideWeaponStatus") as HTMLElement | null;
  sideShieldStatus = document.getElementById("sideShieldStatus") as HTMLElement | null;
  sideTrackName = document.getElementById("sideTrackName") as HTMLElement | null;

  private toastQueue: Achievement[] = [];
  private toastBusy = false;

  selectedShipId: ShipId;
  shakeEnabled: boolean;
  achievements: AchievementManager;

  constructor(sound?: SoundManager) {
    this.sound = sound;
    this.selectedShipId = this.loadSavedShip();
    this.shakeEnabled = this.loadShakeSetting();
    this.achievements = new AchievementManager((a) => this.queueToast(a));

    this.bindDifficultyButtons();
    this.buildShipSelector();
    this.bindExtraButtons();
    this.bindUISoundEffects();
    this.updateSideTelemetry();
  }

  attachSound(sound: SoundManager): void {
    this.sound = sound;
  }

  private bindUISoundEffects(): void {
    const buttons = document.querySelectorAll<HTMLButtonElement>("button");
    for (const btn of buttons) {
      btn.addEventListener("pointerenter", (e) => {
        if (e.pointerType === "mouse" && !btn.disabled) {
          this.sound?.playUIHover();
        }
      });
      btn.addEventListener("click", () => {
        const isBack =
          btn.id.includes("Close") ||
          btn.id.includes("Back") ||
          btn.id.includes("mainMenu");
        if (isBack) {
          this.sound?.playUIBack();
        } else {
          this.sound?.playUIClick();
        }
      });
    }
  }

  // ----- Chọn phi thuyền -----
  private loadSavedShip(): ShipId {
    try {
      const id = localStorage.getItem(SHIP_STORAGE_KEY) as ShipId | null;
      return id && SHIP_MODELS[id] ? id : "phantom";
    } catch {
      return "phantom";
    }
  }

  getSelectedShip(): ShipModel {
    return SHIP_MODELS[this.selectedShipId] || SHIP_MODELS.phantom;
  }

  private buildShipSelector(): void {
    if (!this.shipGroup) return;
    for (const ship of Object.values(SHIP_MODELS)) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "ship-card";
      card.dataset.ship = ship.id;

      const preview = document.createElement("canvas");
      preview.width = 52;
      preview.height = 64;
      const pctx = preview.getContext("2d");
      if (pctx) {
        drawShipShape(pctx, ship, 4, 4, 44, 48, { flameLen: 9 });
      }

      const name = document.createElement("span");
      name.className = "ship-name";
      name.textContent = ship.name;
      const desc = document.createElement("span");
      desc.className = "ship-desc";
      desc.textContent = ship.desc;

      card.append(preview, name, desc);
      card.addEventListener("click", () => {
        this.selectedShipId = ship.id;
        try {
          localStorage.setItem(SHIP_STORAGE_KEY, ship.id);
        } catch {
          // Bỏ qua nếu trình duyệt chặn localStorage
        }
        this.refreshShipSelection();
        this.updateSideTelemetry();
        card.blur();
      });
      this.shipGroup.appendChild(card);
    }
    this.refreshShipSelection();
  }

  private refreshShipSelection(): void {
    if (!this.shipGroup) return;
    for (const card of this.shipGroup.querySelectorAll<HTMLElement>(".ship-card")) {
      card.classList.toggle("active", card.dataset.ship === this.selectedShipId);
    }
  }

  updateSideTelemetry(weaponText = "LV 1", shieldText = "SẴN SÀNG", trackTitle?: string): void {
    if (this.sideShipName) this.sideShipName.textContent = this.getSelectedShip().name.toUpperCase();
    if (this.sideDiffLabel) this.sideDiffLabel.textContent = this.getSelectedDifficulty().label.toUpperCase();
    if (this.sideWeaponStatus) this.sideWeaponStatus.textContent = weaponText;
    if (this.sideShieldStatus) this.sideShieldStatus.textContent = shieldText;
    if (this.sideTrackName && trackTitle !== undefined) {
      this.sideTrackName.textContent = trackTitle || "CHỜ KHỞI HÀNH";
    }
  }

  // ----- Rung màn hình -----
  private loadShakeSetting(): boolean {
    try {
      return localStorage.getItem(SHAKE_STORAGE_KEY) !== "off";
    } catch {
      return true;
    }
  }

  shake(intensity = 6, durationMs = 300): void {
    if (!this.shakeEnabled || !this.canvasContainer || !this.canvasContainer.animate) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const steps = 9;
    const frames: Keyframe[] = [];
    for (let i = 0; i < steps; i++) {
      const decay = 1 - i / steps;
      const dx = (Math.random() * 2 - 1) * intensity * decay;
      const dy = (Math.random() * 2 - 1) * intensity * decay;
      frames.push({ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` });
    }
    frames.push({ transform: "translate(0px, 0px)" });
    this.canvasContainer.animate(frames, { duration: durationMs, easing: "linear" });
  }

  // ----- Thành tựu & Reset kỷ lục -----
  private bindExtraButtons(): void {
    this.achOpenBtn.addEventListener("click", () => {
      this.renderAchievements();
      this.startScreen.classList.remove("active");
      this.achScreen.classList.add("active");
      this.achOpenBtn.blur();
    });
    document.getElementById("achCloseBtn")?.addEventListener("click", () => {
      this.achScreen.classList.remove("active");
      this.startScreen.classList.add("active");
    });

    if (this.leaderboardOpenBtn && this.leaderboardScreen) {
      this.leaderboardOpenBtn.addEventListener("click", () => {
        this.renderLeaderboard(this.startLeaderboardList);
        this.startScreen.classList.remove("active");
        this.leaderboardScreen?.classList.add("active");
        this.leaderboardOpenBtn?.blur();
      });
      document.getElementById("leaderboardCloseBtn")?.addEventListener("click", () => {
        this.leaderboardScreen?.classList.remove("active");
        this.startScreen.classList.add("active");
      });
    }

    if (this.guideOpenBtn && this.guideScreen) {
      this.guideOpenBtn.addEventListener("click", () => {
        this.startScreen.classList.remove("active");
        this.guideScreen?.classList.add("active");
        this.guideOpenBtn?.blur();
      });
      document.getElementById("guideCloseBtn")?.addEventListener("click", () => {
        this.guideScreen?.classList.remove("active");
        this.startScreen.classList.add("active");
      });
    }

    if (this.resetProgressBtn) {
      this.resetProgressBtn.addEventListener("click", () => {
        if (window.confirm("Bạn có chắc muốn xóa toàn bộ kỷ lục và thành tựu?")) {
          this.resetProgress();
        }
        this.resetProgressBtn?.blur();
      });
    }

    if (this.keepProgressBtn) {
      this.keepProgressBtn.addEventListener("click", () => {
        this.showScreen("start");
        this.keepProgressBtn?.blur();
      });
    }

    if (this.confirmResetBtn) {
      this.confirmResetBtn.addEventListener("click", () => {
        this.resetProgress();
        this.showScreen("start");
        this.confirmResetBtn?.blur();
      });
    }

    this.updateAchButtonLabel();
  }

  resetProgress(): void {
    try {
      localStorage.removeItem(GAME_CONFIG.HIGH_SCORE_KEY);
      localStorage.removeItem(GAME_CONFIG.LEADERBOARD_KEY);
      localStorage.removeItem(ACH_STORAGE_KEY);
      localStorage.removeItem(ACH_STATS_KEY);
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage
    }
    this.achievements.unlocked = {};
    this.achievements.stats = { kills: 0, bosses: 0, powerups: 0, blocks: 0, games: 0 };
    this.achievements.run = { score: 0, wave: 1, hit: false, difficulty: "normal" };
    this.toastQueue = [];
    this.updateAchButtonLabel();
    this.renderAchievements();
    this.renderLeaderboard(this.startLeaderboardList);
    this.highScoreDisplay.textContent = "0";
  }

  playIntroSplash(durationMs = 1800): void {
    if (!this.introScreen) {
      this.showScreen(this.resetPromptScreen ? "resetPrompt" : "start");
      return;
    }
    this.renderLeaderboard(this.startLeaderboardList);
    if (this.pauseMenuBtn) this.pauseMenuBtn.style.display = "none";
    this.introScreen.classList.remove("fade-out");
    this.introScreen.classList.add("active");

    window.setTimeout(() => {
      this.introScreen?.classList.add("fade-out");
      this.showScreen(this.resetPromptScreen ? "resetPrompt" : "start");
      window.setTimeout(() => {
        this.introScreen?.classList.remove("active", "fade-out");
      }, 450);
    }, durationMs);
  }

  updateAchButtonLabel(): void {
    this.achOpenBtn.textContent = `🏆 Thành tựu (${this.achievements.count()}/${ACHIEVEMENTS.length})`;
  }

  renderAchievements(): void {
    while (this.achList.firstChild) this.achList.removeChild(this.achList.firstChild);
    this.achCountText.textContent = `${this.achievements.count()}/${ACHIEVEMENTS.length} đã mở khóa`;

    for (const a of ACHIEVEMENTS) {
      const done = Boolean(this.achievements.unlocked[a.id]);
      const row = document.createElement("li");
      row.className = "ach-row" + (done ? " done" : "");

      const icon = document.createElement("span");
      icon.className = "ach-icon";
      icon.textContent = done ? a.icon : "🔒";

      const text = document.createElement("span");
      text.className = "ach-text";
      const title = document.createElement("strong");
      title.textContent = a.title;
      const desc = document.createElement("small");
      desc.textContent = a.desc;
      text.append(title, desc);

      row.append(icon, text);
      this.achList.appendChild(row);
    }
  }

  private queueToast(achievement: Achievement): void {
    this.toastQueue.push(achievement);
    this.updateAchButtonLabel();
    if (!this.toastBusy) this.showNextToast();
  }

  private showNextToast(): void {
    const next = this.toastQueue.shift();
    if (!next) {
      this.toastBusy = false;
      return;
    }
    this.toastBusy = true;
    this.achToast.textContent = `${next.icon} Thành tựu mới: ${next.title}`;
    this.achToast.classList.add("show");
    window.setTimeout(() => {
      this.achToast.classList.remove("show");
      window.setTimeout(() => this.showNextToast(), 350);
    }, 2600);
  }

  private bindDifficultyButtons(): void {
    for (const btn of this.difficultyButtons) {
      btn.addEventListener("click", () => {
        const diffId = btn.dataset.difficulty as DifficultyId | undefined;
        if (!diffId || !GAME_CONFIG.DIFFICULTIES[diffId]) return;
        this.selectedDifficultyId = diffId;
        for (const item of this.difficultyButtons) {
          item.classList.toggle("active", item.dataset.difficulty === diffId);
        }
        this.updateSideTelemetry();
        btn.blur();
      });
    }
  }

  getSelectedDifficulty(): DifficultyConfig {
    return GAME_CONFIG.DIFFICULTIES[this.selectedDifficultyId] || GAME_CONFIG.DIFFICULTIES.normal;
  }

  loadHighScore(): number {
    try {
      const saved = localStorage.getItem(GAME_CONFIG.HIGH_SCORE_KEY);
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  }

  saveHighScore(score: number): void {
    try {
      localStorage.setItem(GAME_CONFIG.HIGH_SCORE_KEY, String(score));
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage
    }
  }

  loadLeaderboard(): LeaderboardEntry[] {
    try {
      const raw = localStorage.getItem(GAME_CONFIG.LEADERBOARD_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item): item is LeaderboardEntry => Boolean(item && typeof item.score === "number" && item.score > 0))
        .sort((a, b) => b.score - a.score)
        .slice(0, GAME_CONFIG.LEADERBOARD_LIMIT);
    } catch {
      return [];
    }
  }

  saveLeaderboard(entries: LeaderboardEntry[]): void {
    try {
      localStorage.setItem(GAME_CONFIG.LEADERBOARD_KEY, JSON.stringify(entries));
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage
    }
  }

  getTopScore(): number {
    const board = this.loadLeaderboard();
    const boardTop = board.length > 0 ? board[0].score : 0;
    return Math.max(this.loadHighScore(), boardTop);
  }

  qualifiesForLeaderboard(score: number): boolean {
    if (score <= 0) return false;
    const board = this.loadLeaderboard();
    if (board.length < GAME_CONFIG.LEADERBOARD_LIMIT) return true;
    return score > board[board.length - 1].score;
  }

  loadLastPlayerName(): string {
    try {
      return localStorage.getItem(GAME_CONFIG.LAST_PLAYER_NAME_KEY) || "";
    } catch {
      return "";
    }
  }

  addLeaderboardEntry(
    name: string,
    score: number,
    wave: number,
    difficultyLabel: string
  ): LeaderboardEntry[] {
    const cleanName = (name || "").trim().slice(0, 16) || "Phi công";
    try {
      localStorage.setItem(GAME_CONFIG.LAST_PLAYER_NAME_KEY, cleanName);
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage
    }

    const board = this.loadLeaderboard();
    board.push({
      name: cleanName,
      score,
      wave,
      difficulty: difficultyLabel || "Thường"
    });
    board.sort((a, b) => b.score - a.score);
    const trimmed = board.slice(0, GAME_CONFIG.LEADERBOARD_LIMIT);
    this.saveLeaderboard(trimmed);

    if (trimmed.length > 0 && trimmed[0].score > this.loadHighScore()) {
      this.saveHighScore(trimmed[0].score);
    }
    return trimmed;
  }

  renderLeaderboard(listElement: HTMLOListElement | null): void {
    if (!listElement) return;
    while (listElement.firstChild) {
      listElement.removeChild(listElement.firstChild);
    }

    const entries = this.loadLeaderboard();
    if (entries.length === 0) {
      const emptyLi = document.createElement("li");
      emptyLi.className = "leaderboard-empty";
      emptyLi.textContent = "Chưa có kỷ lục nào — hãy là người đầu tiên!";
      listElement.appendChild(emptyLi);
      return;
    }

    entries.forEach((entry, index) => {
      const li = document.createElement("li");
      li.className = "leaderboard-row";

      const nameSpan = document.createElement("span");
      nameSpan.className = "lb-name";
      nameSpan.textContent = `#${index + 1} ${entry.name}`;

      const rightSpan = document.createElement("span");
      rightSpan.className = "lb-meta";

      const scoreStrong = document.createElement("span");
      scoreStrong.className = "lb-score";
      scoreStrong.textContent = `${entry.score}đ`;

      const detailText = document.createTextNode(` • Đợt ${entry.wave} (${entry.difficulty})`);
      rightSpan.appendChild(scoreStrong);
      rightSpan.appendChild(detailText);

      li.appendChild(nameSpan);
      li.appendChild(rightSpan);
      listElement.appendChild(li);
    });
  }

  showNowPlaying(trackTitle: string, durationMs = 3000): void {
    if (this.sideTrackName) {
      this.sideTrackName.textContent = trackTitle.toUpperCase();
    }
    if (!this.musicToast || !trackTitle) return;
    if (this.musicToastTimer !== null) {
      clearTimeout(this.musicToastTimer);
      this.musicToastTimer = null;
    }
    this.musicToast.textContent = `🎵 Đang phát: ${trackTitle}`;
    this.musicToast.classList.add("show");
    this.musicToastTimer = window.setTimeout(() => {
      this.musicToast?.classList.remove("show");
      this.musicToastTimer = null;
    }, durationMs);
  }

  hideNowPlaying(): void {
    if (this.sideTrackName) {
      this.sideTrackName.textContent = "CHỜ KHỞI HÀNH";
    }
    if (this.musicToastTimer !== null) {
      clearTimeout(this.musicToastTimer);
      this.musicToastTimer = null;
    }
    this.musicToast?.classList.remove("show");
  }

  updateHUD(score: number, highScore: number, wave: number, hp: number, maxHp: number): void {
    this.scoreDisplay.textContent = String(score);
    this.highScoreDisplay.textContent = String(highScore);
    this.waveDisplay.textContent = String(wave);
    this.achievements.trackProgress(score, wave);

    const percent = Math.max(0, (hp / maxHp) * 100);
    this.hpBarFill.style.width = `${percent}%`;
    this.hpText.textContent = `${hp}/${maxHp}`;

    if (percent > 60) {
      this.hpBarFill.style.background = "linear-gradient(90deg, #06b6d4, #22d3ee)";
    } else if (percent > 30) {
      this.hpBarFill.style.background = "linear-gradient(90deg, #eab308, #facc15)";
    } else {
      this.hpBarFill.style.background = "linear-gradient(90deg, #dc2626, #f87171)";
    }
  }

  showScreen(state: ScreenState, summary: GameOverSummary = {}): void {
    this.resetPromptScreen?.classList.remove("active");
    this.startScreen.classList.remove("active");
    this.pauseScreen.classList.remove("active");
    this.settingsScreen?.classList.remove("active");
    this.gameOverScreen.classList.remove("active");
    this.achScreen.classList.remove("active");
    this.leaderboardScreen?.classList.remove("active");
    this.guideScreen?.classList.remove("active");

    const inGame = state === "playing" || state === "paused" || state === "settings";
    if (this.pauseMenuBtn) {
      this.pauseMenuBtn.style.display = inGame ? "inline-flex" : "none";
    }
    if (this.canvasContainer) {
      this.canvasContainer.classList.toggle("is-playing", state === "playing");
    }

    if (state === "resetPrompt") {
      if (this.resetPromptSummary) {
        const topScore = this.getTopScore();
        const achCount = this.achievements.count();
        this.resetPromptSummary.textContent = `Kỷ lục: ${topScore} điểm • Thành tựu: ${achCount}/${ACHIEVEMENTS.length}`;
      }
      this.resetPromptScreen?.classList.add("active");
    } else if (state === "start") {
      this.renderLeaderboard(this.startLeaderboardList);
      this.startScreen.classList.add("active");
    } else if (state === "paused") {
      this.pauseScreen.classList.add("active");
    } else if (state === "settings") {
      this.settingsScreen?.classList.add("active");
    } else if (state === "gameover") {
      const finalScore = summary.score ?? 0;
      const finalWave = summary.wave ?? 1;
      const diffLabel = summary.difficultyLabel ?? "Thường";

      this.finalScoreText.textContent = String(finalScore);
      this.finalWaveText.textContent = String(finalWave);
      this.finalDifficultyText.textContent = diffLabel;

      const canSave = Boolean(summary.canSaveLeaderboard);
      this.nameEntryBox.classList.toggle("visible", canSave);
      if (canSave) {
        this.playerNameInput.value = this.loadLastPlayerName();
        this.saveScoreBtn.disabled = false;
        this.saveScoreBtn.textContent = "LƯU ĐIỂM";
      }

      this.renderLeaderboard(this.gameOverLeaderboardList);
      this.gameOverScreen.classList.add("active");
    }
  }
}
