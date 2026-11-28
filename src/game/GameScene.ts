import Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import type { SoundManager } from "../sound";
import type {
  DifficultyConfig,
  EnemyType,
  GameState,
  InputState,
  PowerUpType,
  ShipModel
} from "../types";
import type { GameUI } from "../ui";
import { SHIP_MODELS } from "../ships";
import { PhaserBackground } from "./PhaserBackground";
import { shipTextureKey } from "./textures";

const GAME_CANVAS_FONT = "Orbitron, Rajdhani, 'Segoe UI', sans-serif";

export type InputAction = "left" | "right" | "up" | "down" | "shoot";

interface EnemyData {
  type: EnemyType;
  hp: number;
  maxHp: number;
  speedY: number;
  scoreValue: number;
  baseX: number;
  angle: number;
}

interface BossData {
  wave: number;
  bossIndex: number;
  state: "entering" | "fighting";
  dirX: number;
  speedX: number;
  targetY: number;
  hoverPhase: number;
  maxHp: number;
  hp: number;
  scoreValue: number;
  lastShotTime: number;
  shotCounter: number;
  hitFlashUntil: number;
}

interface PowerUpData {
  type: PowerUpType;
  pulse: number;
}

export interface GameSceneDeps {
  sound: SoundManager;
  ui: GameUI;
  onStateChange?: (state: GameState) => void;
}

export class GameScene extends Phaser.Scene {
  private soundMgr!: SoundManager;
  private ui!: GameUI;
  private onStateChange?: (state: GameState) => void;

  private spaceBg!: PhaserBackground;

  private gameState: GameState = "start";
  private simTime = 0;

  private currentDifficulty: DifficultyConfig = GAME_CONFIG.DIFFICULTIES.normal;
  private currentShip: ShipModel = SHIP_MODELS.phantom;

  private score = 0;
  private highScore = 0;
  private wave = 1;

  // Player state
  private playerSprite!: Phaser.Physics.Arcade.Sprite;
  private shieldGraphic!: Phaser.GameObjects.Graphics;
  private shieldWasVisible = false;
  private playerSpeed = GAME_CONFIG.PLAYER.SPEED;
  private playerMaxHp = GAME_CONFIG.PLAYER.MAX_HP;
  private playerHp = GAME_CONFIG.PLAYER.MAX_HP;
  private shootCooldown = GAME_CONFIG.PLAYER.SHOOT_COOLDOWN_MS;
  private autoFire = true;
  private weaponLevel = 1;
  private weaponBoostUntil = 0;
  private shieldUntil = 0;
  private lastShotTime = 0;
  private invincibleUntil = 0;

  // Pooled Groups
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private powerUps!: Phaser.Physics.Arcade.Group;

  // Pooled Particle Emitter
  private explosionEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  // Boss state
  private bossSprite: Phaser.Physics.Arcade.Sprite | null = null;
  private bossData: BossData | null = null;
  private bossCount = 0;
  private nextBossWave = GAME_CONFIG.BOSS.EVERY_WAVES;
  private bossWarningUntil = 0;
  private lastEnemySpawnTime = 0;

  // Persistent Canvas HUD overlays (zero allocation per frame)
  private bossHpGraphics!: Phaser.GameObjects.Graphics;
  private bossHpText!: Phaser.GameObjects.Text;
  private lastBossHpRendered = -1;

  private bossWarningGraphics!: Phaser.GameObjects.Graphics;
  private bossWarningText!: Phaser.GameObjects.Text;
  private lastWarningVisible = false;

  private powerUpHudGraphics!: Phaser.GameObjects.Graphics;
  private weaponBadgeText!: Phaser.GameObjects.Text;
  private shieldBadgeText!: Phaser.GameObjects.Text;
  private lastBadgesSignature = "";

  // DOM HUD dirty-check cache (avoid mutating DOM 60x/s when unchanged)
  private lastDomScore = -1;
  private lastDomHighScore = -1;
  private lastDomWave = -1;
  private lastDomHp = -1;
  private lastDomMaxHp = -1;
  private lastSideWeapon = "";
  private lastSideShield = "";

  // Input state
  private activeActions = new Set<InputAction>();
  private isPointerDown = false;

  constructor() {
    super({ key: "GameScene" });
  }

  setDependencies(deps: GameSceneDeps): void {
    this.soundMgr = deps.sound;
    this.ui = deps.ui;
    this.onStateChange = deps.onStateChange;
  }

  create(): void {
    const W = GAME_CONFIG.CANVAS_WIDTH;
    const H = GAME_CONFIG.CANVAS_HEIGHT;

    this.spaceBg = new PhaserBackground(this, W, H);

    // Pooled Arcade Groups
    this.playerBullets = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.powerUps = this.physics.add.group();

    // Pooled ParticleEmitter duy nhất
    this.explosionEmitter = this.add
      .particles(0, 0, "particle_dot", {
        speed: { min: 65, max: 230 },
        scale: { start: 0.75, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: 420,
        emitting: false
      })
      .setDepth(12);

    // Player
    this.playerSprite = this.physics.add.sprite(
      W / 2,
      H - GAME_CONFIG.PLAYER.HEIGHT / 2 - 28,
      shipTextureKey(this.currentShip.id, 1)
    );
    this.playerSprite.setOrigin(0.5, 24 / 64);
    this.playerSprite.setDepth(5);
    const pBody = this.playerSprite.body as Phaser.Physics.Arcade.Body;
    pBody.setSize(GAME_CONFIG.PLAYER.WIDTH - 10, GAME_CONFIG.PLAYER.HEIGHT - 10);
    pBody.setOffset(5, 5);
    this.playerSprite.setVisible(false);

    // Shield graphic (vẽ vòng tròn 1 lần tại local origin 0,0, chỉ di chuyển vị trí)
    const shieldRadius = Math.max(GAME_CONFIG.PLAYER.WIDTH, GAME_CONFIG.PLAYER.HEIGHT) * 0.68;
    this.shieldGraphic = this.add.graphics().setDepth(6).setVisible(false);
    this.shieldGraphic.fillStyle(0x22d3ee, 0.14);
    this.shieldGraphic.lineStyle(2.5, 0x22d3ee, 1);
    this.shieldGraphic.fillCircle(0, 0, shieldRadius);
    this.shieldGraphic.strokeCircle(0, 0, shieldRadius);

    // Persistent Canvas HUD overlays
    this.bossHpGraphics = this.add.graphics().setDepth(20);
    this.bossHpText = this.add
      .text(W / 2, 56 + 9, "", {
        fontFamily: GAME_CANVAS_FONT,
        fontSize: "10px",
        fontStyle: "bold",
        color: "#fca5a5"
      })
      .setOrigin(0.5, 1)
      .setDepth(21)
      .setVisible(false);

    this.bossWarningGraphics = this.add.graphics().setDepth(25).setVisible(false);
    this.bossWarningGraphics.fillStyle(0x7f1d1d, 0.86);
    this.bossWarningGraphics.fillRect(32, H * 0.28, W - 64, 46);
    this.bossWarningGraphics.lineStyle(2, 0xf87171, 1);
    this.bossWarningGraphics.strokeRect(32, H * 0.28, W - 64, 46);

    this.bossWarningText = this.add
      .text(W / 2, H * 0.28 + 23, "CẢNH BÁO: BOSS SẮP XUẤT HIỆN!", {
        fontFamily: GAME_CANVAS_FONT,
        fontSize: "14px",
        fontStyle: "bold",
        color: "#fef08a"
      })
      .setOrigin(0.5)
      .setDepth(26)
      .setVisible(false);

    this.powerUpHudGraphics = this.add.graphics().setDepth(20);
    this.weaponBadgeText = this.add
      .text(17, H - 14, "", {
        fontFamily: GAME_CANVAS_FONT,
        fontSize: "10px",
        fontStyle: "bold",
        color: "#facc15"
      })
      .setOrigin(0, 1)
      .setDepth(21)
      .setVisible(false);

    this.shieldBadgeText = this.add
      .text(17, H - 14, "", {
        fontFamily: GAME_CANVAS_FONT,
        fontSize: "10px",
        fontStyle: "bold",
        color: "#22d3ee"
      })
      .setOrigin(0, 1)
      .setDepth(21)
      .setVisible(false);

    // Physics overlaps
    this.physics.add.overlap(
      this.playerBullets,
      this.enemies,
      this.onBulletHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.playerSprite,
      this.enemies,
      this.onPlayerHitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.playerSprite,
      this.enemyBullets,
      this.onPlayerHitEnemyBullet as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.playerSprite,
      this.powerUps,
      this.onPlayerCollectPowerUp as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    // Pointer input
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.gameState !== "playing") return;
      this.soundMgr.ensureContext();
      this.isPointerDown = true;
      this.movePlayerTo(pointer.x, pointer.y);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.gameState !== "playing" || !this.isPointerDown) return;
      this.movePlayerTo(pointer.x, pointer.y);
    });
    this.input.on("pointerup", () => {
      this.isPointerDown = false;
    });

    this.highScore = this.ui.getTopScore();
    this.syncDomHUD(true);
  }

  // ===== Public API cho main.ts / UI =====
  getGameState(): GameState {
    return this.gameState;
  }

  isAutoFire(): boolean {
    return this.autoFire;
  }

  toggleAutoFire(): boolean {
    this.autoFire = !this.autoFire;
    return this.autoFire;
  }

  setInputAction(action: InputAction, active: boolean): void {
    if (active) this.activeActions.add(action);
    else this.activeActions.delete(action);
  }

  clearInputs(): void {
    this.activeActions.clear();
    this.isPointerDown = false;
  }

  startNewGame(): void {
    this.clearInputs();
    this.soundMgr.ensureContext();

    this.currentDifficulty = this.ui.getSelectedDifficulty();
    this.currentShip = this.ui.getSelectedShip();

    this.playerSpeed = GAME_CONFIG.PLAYER.SPEED * this.currentShip.speedMul;
    this.shootCooldown = GAME_CONFIG.PLAYER.SHOOT_COOLDOWN_MS * this.currentShip.cooldownMul;
    this.playerMaxHp = Math.max(1, this.currentDifficulty.playerMaxHp + this.currentShip.hpBonus);
    this.playerHp = this.playerMaxHp;

    this.weaponLevel = 1;
    this.weaponBoostUntil = 0;
    this.shieldUntil = 0;
    this.lastShotTime = 0;
    this.invincibleUntil = 0;

    this.clearEntities();
    this.spaceBg.reset();

    const W = GAME_CONFIG.CANVAS_WIDTH;
    const H = GAME_CONFIG.CANVAS_HEIGHT;
    this.playerSprite.setTexture(shipTextureKey(this.currentShip.id, 1));
    this.playerSprite.setPosition(W / 2, H - GAME_CONFIG.PLAYER.HEIGHT / 2 - 28);
    this.playerSprite.setVisible(true);
    (this.playerSprite.body as Phaser.Physics.Arcade.Body).enable = true;

    this.bossCount = 0;
    this.nextBossWave = GAME_CONFIG.BOSS.EVERY_WAVES;
    this.bossWarningUntil = 0;
    this.score = 0;
    this.wave = 1;
    this.highScore = this.ui.getTopScore();
    this.simTime = 0;
    this.lastEnemySpawnTime = 0;

    this.physics.world.resume();
    this.tweens.resumeAll();
    this.setGameState("playing");

    this.ui.achievements.notify("run_start", { difficulty: this.currentDifficulty.id });
    this.syncDomHUD(true);
    this.ui.showScreen("playing");

    const track = this.soundMgr.startMusic(false);
    this.ui.updateSideTelemetry("LV 1", "CHỜ", track?.title);
    this.lastSideWeapon = "LV 1";
    this.lastSideShield = "CHỜ";
    if (track?.title) {
      this.ui.showNowPlaying(track.title, GAME_CONFIG.MUSIC.NOW_PLAYING_DURATION_MS || 3000);
    }
  }

  pauseGame(): void {
    if (this.gameState !== "playing") return;
    this.clearInputs();
    this.setGameState("paused");
    this.physics.world.pause();
    this.tweens.pauseAll();
    this.soundMgr.pauseMusic();
    this.ui.showScreen("paused");
  }

  resumeGame(): void {
    if (this.gameState !== "paused") return;
    this.clearInputs();
    this.setGameState("playing");
    this.physics.world.resume();
    this.tweens.resumeAll();
    this.soundMgr.resumeMusic();
    this.ui.showScreen("playing");
  }

  returnToMainMenu(): void {
    this.clearInputs();
    this.setGameState("start");
    this.physics.world.resume();
    this.tweens.resumeAll();
    this.soundMgr.stopMusic();
    this.ui.hideNowPlaying();
    this.ui.updateSideTelemetry("LV 1", "SẴN SÀNG", "CHỜ KHỞI HÀNH");

    this.clearEntities();
    this.playerSprite.setVisible(false);

    this.highScore = this.ui.getTopScore();
    this.score = 0;
    this.wave = 1;
    this.playerHp = this.playerMaxHp;
    this.syncDomHUD(true);
    this.ui.showScreen("start");
  }

  private setGameState(state: GameState): void {
    this.gameState = state;
    this.onStateChange?.(state);
  }

  private disableGroupChildren(group: Phaser.Physics.Arcade.Group): void {
    for (const child of group.getChildren()) {
      const s = child as Phaser.Physics.Arcade.Sprite;
      if (s.active) s.disableBody(true, true);
    }
  }

  private clearEntities(): void {
    this.disableGroupChildren(this.playerBullets);
    this.disableGroupChildren(this.enemies);
    this.disableGroupChildren(this.enemyBullets);
    this.disableGroupChildren(this.powerUps);

    if (this.bossSprite) {
      this.bossSprite.destroy();
      this.bossSprite = null;
    }
    this.bossData = null;

    this.shieldGraphic.setVisible(false);
    this.shieldWasVisible = false;

    this.bossHpGraphics.clear();
    this.bossHpText.setVisible(false);
    this.lastBossHpRendered = -1;

    this.bossWarningGraphics.setVisible(false);
    this.bossWarningText.setVisible(false);
    this.lastWarningVisible = false;

    this.powerUpHudGraphics.clear();
    this.weaponBadgeText.setVisible(false);
    this.shieldBadgeText.setVisible(false);
    this.lastBadgesSignature = "";
  }

  // ===== Main Phaser Update Loop =====
  update(_time: number, delta: number): void {
    const clampedDelta = Math.min(50, delta);
    const dtFactor = clampedDelta / 16.67;

    this.spaceBg.update(dtFactor, this.gameState === "playing");

    if (this.gameState !== "playing") {
      return;
    }

    this.simTime += clampedDelta;
    this.updatePlayer(dtFactor);
    this.updateWavesAndSpawns(dtFactor);
    this.updateBoss(dtFactor);
    this.cleanupOffscreen();
    this.updateCanvasOverlays();
    this.syncDomHUD(false);
  }

  private syncDomHUD(force: boolean): void {
    if (
      force ||
      this.score !== this.lastDomScore ||
      this.highScore !== this.lastDomHighScore ||
      this.wave !== this.lastDomWave ||
      this.playerHp !== this.lastDomHp ||
      this.playerMaxHp !== this.lastDomMaxHp
    ) {
      this.lastDomScore = this.score;
      this.lastDomHighScore = this.highScore;
      this.lastDomWave = this.wave;
      this.lastDomHp = this.playerHp;
      this.lastDomMaxHp = this.playerMaxHp;
      this.ui.updateHUD(this.score, this.highScore, this.wave, this.playerHp, this.playerMaxHp);
    }

    const shieldActive = this.simTime < this.shieldUntil;
    const shieldSec = shieldActive ? Math.ceil((this.shieldUntil - this.simTime) / 1000) : 0;
    const weaponStr = `TIA ${this.weaponLevel}`;
    const shieldStr = shieldActive ? `BẬT (${shieldSec}s)` : "CHỜ";

    if (force || weaponStr !== this.lastSideWeapon || shieldStr !== this.lastSideShield) {
      this.lastSideWeapon = weaponStr;
      this.lastSideShield = shieldStr;
      this.ui.updateSideTelemetry(weaponStr, shieldStr);
    }
  }

  private movePlayerTo(x: number, y: number): void {
    const hw = GAME_CONFIG.PLAYER.WIDTH / 2;
    const hh = GAME_CONFIG.PLAYER.HEIGHT / 2;
    const cx = Phaser.Math.Clamp(x, 8 + hw, GAME_CONFIG.CANVAS_WIDTH - 8 - hw);
    const cy = Phaser.Math.Clamp(y, 12 + hh, GAME_CONFIG.CANVAS_HEIGHT - 10 - hh);
    this.playerSprite.setPosition(cx, cy);
  }

  private getInputState(): InputState {
    return {
      left: this.activeActions.has("left"),
      right: this.activeActions.has("right"),
      up: this.activeActions.has("up"),
      down: this.activeActions.has("down"),
      shoot: this.activeActions.has("shoot") || this.isPointerDown
    };
  }

  private updatePlayer(dtFactor: number): void {
    if (this.weaponLevel > 1 && this.simTime >= this.weaponBoostUntil) {
      this.weaponLevel = 1;
      this.playerSprite.setTexture(shipTextureKey(this.currentShip.id, 1));
    }

    const input = this.getInputState();
    let moveX = 0;
    let moveY = 0;
    if (input.left) moveX -= 1;
    if (input.right) moveX += 1;
    if (input.up) moveY -= 1;
    if (input.down) moveY += 1;

    if (moveX !== 0 && moveY !== 0) {
      const invSqrt2 = 0.7071;
      moveX *= invSqrt2;
      moveY *= invSqrt2;
    }

    if (moveX !== 0 || moveY !== 0) {
      this.movePlayerTo(
        this.playerSprite.x + moveX * this.playerSpeed * dtFactor,
        this.playerSprite.y + moveY * this.playerSpeed * dtFactor
      );
    }

    if (this.autoFire || input.shoot) {
      if (this.simTime - this.lastShotTime >= this.shootCooldown) {
        this.firePlayerBullets();
        this.lastShotTime = this.simTime;
        this.soundMgr.playShoot(this.weaponLevel);
      }
    }

    const isBlinkHidden =
      this.simTime < this.invincibleUntil && Math.floor(this.simTime / 90) % 2 === 0;
    this.playerSprite.setVisible(!isBlinkHidden);

    const hasShield = this.simTime < this.shieldUntil && !isBlinkHidden;
    const shieldVisible =
      hasShield &&
      (this.shieldUntil - this.simTime > 2000 || Math.floor(this.simTime / 110) % 2 === 0);

    if (shieldVisible) {
      this.shieldGraphic.setPosition(this.playerSprite.x, this.playerSprite.y);
      if (!this.shieldWasVisible) {
        this.shieldGraphic.setVisible(true);
        this.shieldWasVisible = true;
      }
    } else if (this.shieldWasVisible) {
      this.shieldGraphic.setVisible(false);
      this.shieldWasVisible = false;
    }
  }

  private firePlayerBullets(): void {
    const cx = this.playerSprite.x;
    const topY = this.playerSprite.y - GAME_CONFIG.PLAYER.HEIGHT / 2 - 4;
    const speed = GAME_CONFIG.BULLET.SPEED * 60;

    const spawn = (x: number, y: number, vx: number, vy: number, key: string) => {
      const bullet = this.playerBullets.get(x, y, key) as Phaser.Physics.Arcade.Sprite | null;
      if (!bullet) return;
      bullet.setTexture(key);
      bullet.enableBody(true, x, y, true, true);
      bullet.setDepth(4);
      const body = bullet.body as Phaser.Physics.Arcade.Body;
      body.setSize(GAME_CONFIG.BULLET.WIDTH, GAME_CONFIG.BULLET.HEIGHT, true);
      body.setVelocity(vx, vy);
    };

    if (this.weaponLevel === 1) {
      spawn(cx, topY, 0, -speed, "bullet_lv1");
    } else if (this.weaponLevel === 2) {
      spawn(cx - 11, topY + 4, 0, -speed, "bullet_lv2");
      spawn(cx + 11, topY + 4, 0, -speed, "bullet_lv2");
    } else {
      spawn(cx, topY, 0, -speed, "bullet_lv3");
      spawn(cx - 10, topY + 6, -1.7 * 60, -speed * 0.96, "bullet_lv3");
      spawn(cx + 10, topY + 6, 1.7 * 60, -speed * 0.96, "bullet_lv3");
    }
  }

  private updateWavesAndSpawns(dtFactor: number): void {
    this.wave = Math.floor(this.score / 100) + 1;

    if (this.wave >= this.nextBossWave && !this.bossSprite) {
      this.spawnBoss();
    }

    if (!this.bossSprite) {
      const baseInterval = Math.max(
        GAME_CONFIG.ENEMY.MIN_SPAWN_MS,
        GAME_CONFIG.ENEMY.BASE_SPAWN_MS - (this.wave - 1) * 85
      );
      const spawnInterval = baseInterval * this.currentDifficulty.spawnRateMul;

      if (this.simTime - this.lastEnemySpawnTime >= spawnInterval) {
        const zigzagChance = Math.min(0.45, 0.12 + (this.wave - 1) * 0.05);
        const type: EnemyType = Math.random() < zigzagChance ? "zigzag" : "basic";
        this.spawnEnemy(type);
        this.lastEnemySpawnTime = this.simTime;
      }
    }

    for (const child of this.enemies.getChildren()) {
      const enemy = child as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      const data = enemy.getData("enemy") as EnemyData | undefined;
      if (!data || data.type !== "zigzag") continue;

      data.angle += 0.06 * dtFactor;
      const halfW = enemy.width / 2;
      enemy.x = Phaser.Math.Clamp(
        data.baseX + Math.sin(data.angle) * 45,
        8 + halfW,
        GAME_CONFIG.CANVAS_WIDTH - 8 - halfW
      );
    }

    for (const child of this.powerUps.getChildren()) {
      const item = child as Phaser.Physics.Arcade.Sprite;
      if (!item.active) continue;
      const data = item.getData("powerup") as PowerUpData | undefined;
      if (!data) continue;
      data.pulse += 0.1 * dtFactor;
      item.setScale(1 + Math.sin(data.pulse) * 0.08);
    }
  }

  private spawnEnemy(type: EnemyType): void {
    const w = type === "zigzag" ? 40 : 36;
    const h = type === "zigzag" ? 38 : 34;
    const x = 16 + w / 2 + Math.random() * (GAME_CONFIG.CANVAS_WIDTH - w - 32);
    const y = -h / 2;

    const waveBonus = Math.min(2.2, (this.wave - 1) * 0.2);
    const speedY = ((type === "zigzag" ? 2.4 : 2.8) + waveBonus) * this.currentDifficulty.enemySpeedMul;
    const baseHp = type === "zigzag" ? 2 : 1;
    const hp = Math.max(1, Math.round(baseHp * this.currentDifficulty.enemyHpMul));
    const baseScore = type === "zigzag" ? 20 : GAME_CONFIG.ENEMY.SCORE_PER_KILL;
    const scoreValue = Math.max(5, Math.round(baseScore * this.currentDifficulty.scoreMul));

    const texKey = type === "zigzag" ? "enemy_zigzag" : "enemy_basic";
    const enemy = this.enemies.get(x, y, texKey) as Phaser.Physics.Arcade.Sprite | null;
    if (!enemy) return;

    enemy.setTexture(texKey);
    enemy.enableBody(true, x, y, true, true);
    enemy.setDepth(4);
    const body = enemy.body as Phaser.Physics.Arcade.Body;
    body.setSize(w - 6, h - 6, true);
    body.setVelocity(0, speedY * 60);

    const data: EnemyData = {
      type,
      hp,
      maxHp: hp,
      speedY,
      scoreValue,
      baseX: x,
      angle: Math.random() * Math.PI * 2
    };
    enemy.setData("enemy", data);
  }

  private spawnBoss(): void {
    this.bossCount += 1;
    const bossW = GAME_CONFIG.BOSS.WIDTH;
    const bossH = GAME_CONFIG.BOSS.HEIGHT;
    const rawHp =
      GAME_CONFIG.BOSS.BASE_HP + (this.bossCount - 1) * GAME_CONFIG.BOSS.HP_PER_APPEARANCE;
    const maxHp = Math.max(15, Math.round(rawHp * this.currentDifficulty.bossHpMul));

    this.bossData = {
      wave: this.wave,
      bossIndex: this.bossCount,
      state: "entering",
      dirX: Math.random() < 0.5 ? -1 : 1,
      speedX: GAME_CONFIG.BOSS.SPEED_X * this.currentDifficulty.enemySpeedMul,
      targetY: 62 + bossH / 2,
      hoverPhase: 0,
      maxHp,
      hp: maxHp,
      scoreValue: Math.round(GAME_CONFIG.BOSS.SCORE_REWARD * this.currentDifficulty.scoreMul),
      lastShotTime: 0,
      shotCounter: 0,
      hitFlashUntil: 0
    };
    this.lastBossHpRendered = -1;

    this.bossSprite = this.physics.add.sprite(
      GAME_CONFIG.CANVAS_WIDTH / 2,
      -bossH / 2 - 10,
      "boss_normal"
    );
    this.bossSprite.setDepth(4);
    const body = this.bossSprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(bossW - 12, bossH - 12);

    this.physics.add.overlap(
      this.playerBullets,
      this.bossSprite,
      this.onBulletHitBoss as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );
    this.physics.add.overlap(
      this.playerSprite,
      this.bossSprite,
      this.onPlayerHitBoss as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined,
      this
    );

    this.bossWarningUntil = this.simTime + 2200;
    this.triggerShake(4, 500);
    this.soundMgr.playBossWarning();
    this.soundMgr.setBossMusic(true);
  }

  private updateBoss(dtFactor: number): void {
    if (!this.bossSprite || !this.bossData) return;
    const b = this.bossData;

    if (b.state === "entering") {
      this.bossSprite.y += 2.2 * dtFactor;
      if (this.bossSprite.y >= b.targetY) {
        this.bossSprite.y = b.targetY;
        b.state = "fighting";
        b.lastShotTime = this.simTime - 300;
      }
      return;
    }

    const enraged = b.hp <= b.maxHp * 0.5;
    const speedFactor = enraged ? 1.25 : 1;
    const halfW = GAME_CONFIG.BOSS.WIDTH / 2;

    this.bossSprite.x += b.dirX * b.speedX * speedFactor * dtFactor;
    if (this.bossSprite.x <= 14 + halfW) {
      this.bossSprite.x = 14 + halfW;
      b.dirX = 1;
    } else if (this.bossSprite.x >= GAME_CONFIG.CANVAS_WIDTH - 14 - halfW) {
      this.bossSprite.x = GAME_CONFIG.CANVAS_WIDTH - 14 - halfW;
      b.dirX = -1;
    }

    b.hoverPhase += 0.05 * dtFactor;
    this.bossSprite.y = b.targetY + Math.sin(b.hoverPhase) * 8;

    const isFlashing = this.simTime < b.hitFlashUntil;
    const desiredKey = isFlashing ? "boss_flash" : enraged ? "boss_enraged" : "boss_normal";
    if (this.bossSprite.texture.key !== desiredKey) {
      this.bossSprite.setTexture(desiredKey);
    }

    const shootInterval = enraged
      ? GAME_CONFIG.BOSS.SHOOT_INTERVAL_MS * 0.75
      : GAME_CONFIG.BOSS.SHOOT_INTERVAL_MS;

    if (this.simTime - b.lastShotTime >= shootInterval) {
      this.fireBossPattern(b, enraged);
      b.lastShotTime = this.simTime;
    }
  }

  private fireBossPattern(b: BossData, enraged: boolean): void {
    if (!this.bossSprite) return;
    b.shotCounter += 1;
    const cx = this.bossSprite.x;
    const muzzleY = this.bossSprite.y + GAME_CONFIG.BOSS.HEIGHT / 2 - 6;
    const speed = GAME_CONFIG.BOSS.BULLET_SPEED * 60;

    const spawnBullet = (x: number, y: number, vx: number, vy: number, key: string, r: number) => {
      const eb = this.enemyBullets.get(x, y, key) as Phaser.Physics.Arcade.Sprite | null;
      if (!eb) return;
      eb.setTexture(key);
      eb.enableBody(true, x, y, true, true);
      eb.setDepth(4);
      eb.setData("color", key === "ebullet_orange" ? "#f97316" : "#fb7185");
      const body = eb.body as Phaser.Physics.Arcade.Body;
      body.setCircle(r, (eb.width - r * 2) / 2, (eb.height - r * 2) / 2);
      body.setVelocity(vx, vy);
    };

    if (enraged && b.shotCounter % 2 === 0) {
      for (const a of [-0.46, -0.23, 0, 0.23, 0.46]) {
        spawnBullet(cx, muzzleY, Math.sin(a) * speed, Math.cos(a) * speed, "ebullet_orange", 6);
      }
      return;
    }

    if (b.shotCounter % 2 === 1) {
      const baseAngle = Phaser.Math.Angle.Between(
        cx,
        muzzleY,
        this.playerSprite.x,
        this.playerSprite.y
      );
      for (const offset of [-0.18, 0, 0.18]) {
        const angle = baseAngle + offset;
        spawnBullet(
          cx,
          muzzleY,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          "ebullet_pink",
          5
        );
      }
    } else {
      const leftX = this.bossSprite.x - GAME_CONFIG.BOSS.WIDTH / 2 + 22;
      const rightX = this.bossSprite.x + GAME_CONFIG.BOSS.WIDTH / 2 - 22;
      spawnBullet(leftX, muzzleY - 4, 0, speed * 1.05, "ebullet_pink", 5);
      spawnBullet(rightX, muzzleY - 4, 0, speed * 1.05, "ebullet_pink", 5);
    }
  }

  // ===== Va chạm (Arcade Physics Callbacks) =====
  private onBulletHitEnemy(
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody
  ): void {
    const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    if (!bullet.active || !enemy.active) return;

    const data = enemy.getData("enemy") as EnemyData | undefined;
    if (!data) return;

    const bx = bullet.x;
    const by = bullet.y;
    bullet.disableBody(true, true);
    data.hp -= 1;

    if (data.hp <= 0) {
      const ex = enemy.x;
      const ey = enemy.y;
      enemy.disableBody(true, true);

      this.ui.achievements.notify("kill");
      this.score += data.scoreValue;
      this.updateHighScoreIfNeeded();

      const color = data.type === "zigzag" ? "#c084fc" : "#f97316";
      this.spawnExplosion(ex, ey, color, 12);
      this.soundMgr.playExplosion(false);
      this.addFloatingText(ex, ey - 8, `+${data.scoreValue}`, "#fde047");
      this.maybeDropPowerUp(ex, ey);
    } else {
      enemy.setTexture(data.type === "zigzag" ? "enemy_zigzag_hit" : "enemy_basic_hit");
      this.spawnExplosion(bx, by, "#fde047", 4);
      this.soundMgr.playHit();
    }
  }

  private onBulletHitBoss(
    bulletObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    bossObj: Phaser.Types.Physics.Arcade.GameObjectWithBody
  ): void {
    const bullet = bulletObj as Phaser.Physics.Arcade.Sprite;
    const boss = bossObj as Phaser.Physics.Arcade.Sprite;
    if (!bullet.active || !boss.active || !this.bossData || this.bossData.state !== "fighting") {
      return;
    }

    const btx = bullet.x;
    const bty = bullet.y;
    bullet.disableBody(true, true);
    this.bossData.hp -= 1;
    this.bossData.hitFlashUntil = this.simTime + 70;

    if (this.bossData.hp <= 0) {
      const bx = boss.x;
      const by = boss.y;
      const reward = this.bossData.scoreValue;

      boss.destroy();
      this.bossSprite = null;
      this.bossData = null;

      this.ui.achievements.notify("boss_kill");
      this.triggerShake(9, 500);
      this.score += reward;
      this.updateHighScoreIfNeeded();
      this.nextBossWave += GAME_CONFIG.BOSS.EVERY_WAVES;

      this.spawnExplosion(bx, by, "#f97316", 28);
      this.spawnExplosion(bx, by, "#fde047", 18);
      this.soundMgr.playExplosion(true);
      this.addFloatingText(bx, by, `BOSS +${reward}`, "#facc15");

      this.spawnPowerUp(bx - 24, by, "heal");
      this.spawnPowerUp(bx + 24, by, Math.random() < 0.5 ? "weapon" : "shield");
      this.soundMgr.setBossMusic(false);
    } else {
      this.spawnExplosion(btx, bty, "#fde047", 3);
      this.soundMgr.playHit();
    }
  }

  private onPlayerHitEnemy(
    _playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    enemyObj: Phaser.Types.Physics.Arcade.GameObjectWithBody
  ): void {
    const enemy = enemyObj as Phaser.Physics.Arcade.Sprite;
    if (!enemy.active || this.gameState !== "playing") return;
    const ex = enemy.x;
    const ey = enemy.y;
    enemy.disableBody(true, true);
    this.spawnExplosion(ex, ey, "#ef4444", 12);
    this.handlePlayerHit();
  }

  private onPlayerHitEnemyBullet(
    _playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    ebObj: Phaser.Types.Physics.Arcade.GameObjectWithBody
  ): void {
    const eb = ebObj as Phaser.Physics.Arcade.Sprite;
    if (!eb.active || this.gameState !== "playing") return;
    const color = (eb.getData("color") as string) || "#fb7185";
    const bx = eb.x;
    const by = eb.y;
    eb.disableBody(true, true);
    this.spawnExplosion(bx, by, color, 6);
    this.handlePlayerHit();
  }

  private onPlayerHitBoss(): void {
    if (this.gameState !== "playing" || !this.bossSprite) return;
    this.handlePlayerHit();
  }

  private onPlayerCollectPowerUp(
    _playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody,
    itemObj: Phaser.Types.Physics.Arcade.GameObjectWithBody
  ): void {
    const item = itemObj as Phaser.Physics.Arcade.Sprite;
    if (!item.active || this.gameState !== "playing") return;
    const data = item.getData("powerup") as PowerUpData | undefined;
    if (!data) return;

    const ix = item.x;
    const iy = item.y;
    item.disableBody(true, true);

    this.soundMgr.playPowerUp(data.type);
    this.ui.achievements.notify("powerup");

    if (data.type === "heal") {
      const before = this.playerHp;
      this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 1);
      this.addFloatingText(ix, iy, this.playerHp > before ? "+1 MÁU" : "ĐẦY MÁU", "#4ade80");
    } else if (data.type === "weapon") {
      this.weaponLevel = Math.min(3, this.weaponLevel + 1);
      this.weaponBoostUntil = this.simTime + GAME_CONFIG.POWERUP.WEAPON_DURATION_MS;
      this.playerSprite.setTexture(shipTextureKey(this.currentShip.id, this.weaponLevel));
      this.addFloatingText(ix, iy, `ĐẠN ${this.weaponLevel} TIA`, "#facc15");
    } else if (data.type === "shield") {
      this.shieldUntil = this.simTime + GAME_CONFIG.POWERUP.SHIELD_DURATION_MS;
      this.addFloatingText(ix, iy, "KHIÊN BẢO VỆ", "#22d3ee");
    }
  }

  private handlePlayerHit(): void {
    if (this.simTime < this.invincibleUntil) return;

    if (this.simTime < this.shieldUntil) {
      this.shieldUntil = 0;
      this.invincibleUntil = this.simTime + 650;
      this.ui.achievements.notify("shield_block");
      this.triggerShake(3, 160);
      this.soundMgr.playPlayerHit();
      this.spawnExplosion(this.playerSprite.x, this.playerSprite.y, "#22d3ee", 14);
      this.addFloatingText(this.playerSprite.x, this.playerSprite.y - 30, "CHẮN ĐÒN!", "#22d3ee");
      return;
    }

    this.playerHp = Math.max(0, this.playerHp - 1);
    this.invincibleUntil = this.simTime + GAME_CONFIG.PLAYER.INVINCIBLE_MS;
    this.ui.achievements.notify("hit");
    this.triggerShake(this.playerHp <= 0 ? 12 : 7, this.playerHp <= 0 ? 600 : 320);

    if (this.playerHp <= 0) {
      this.soundMgr.playExplosion(true);
      this.soundMgr.playGameOver();
      this.spawnExplosion(this.playerSprite.x, this.playerSprite.y, "#38bdf8", 22);
      this.triggerGameOver();
    } else {
      this.soundMgr.playPlayerHit();
      this.addFloatingText(this.playerSprite.x, this.playerSprite.y - 30, "-1 MÁU", "#f87171");
    }
  }

  private triggerGameOver(): void {
    this.setGameState("gameover");
    this.clearInputs();
    this.playerSprite.setVisible(false);
    this.shieldGraphic.setVisible(false);
    this.shieldWasVisible = false;
    this.soundMgr.stopMusic();
    this.ui.hideNowPlaying();
    this.ui.updateSideTelemetry("NGỪNG HOẠT ĐỘNG", "HỎNG", "CHỜ KHỞI HÀNH");

    this.updateHighScoreIfNeeded();
    this.syncDomHUD(true);
    this.ui.showScreen("gameover", {
      score: this.score,
      wave: this.wave,
      difficultyLabel: this.currentDifficulty.label,
      canSaveLeaderboard: this.ui.qualifiesForLeaderboard(this.score)
    });
  }

  // ===== Helpers: Spawn, Effects, Overlays =====
  private maybeDropPowerUp(x: number, y: number): void {
    if (Math.random() > GAME_CONFIG.POWERUP.DROP_CHANCE) return;
    const roll = Math.random();
    let type: PowerUpType = "weapon";
    if (this.playerHp < this.playerMaxHp) {
      if (roll < 0.34) type = "heal";
      else if (roll < 0.67) type = "weapon";
      else type = "shield";
    } else {
      if (roll < 0.1) type = "heal";
      else if (roll < 0.55) type = "weapon";
      else type = "shield";
    }
    this.spawnPowerUp(x, y, type);
  }

  private spawnPowerUp(x: number, y: number, type: PowerUpType): void {
    const half = GAME_CONFIG.POWERUP.SIZE / 2;
    const clampedX = Phaser.Math.Clamp(x, 10 + half, GAME_CONFIG.CANVAS_WIDTH - 10 - half);
    const key = `powerup_${type}`;
    const item = this.powerUps.get(clampedX, y, key) as Phaser.Physics.Arcade.Sprite | null;
    if (!item) return;

    item.setTexture(key);
    item.setScale(1);
    item.enableBody(true, clampedX, y, true, true);
    item.setDepth(4);
    const body = item.body as Phaser.Physics.Arcade.Body;
    body.setSize(GAME_CONFIG.POWERUP.SIZE, GAME_CONFIG.POWERUP.SIZE, true);
    body.setVelocity(0, GAME_CONFIG.POWERUP.SPEED_Y * 60);
    item.setData("powerup", { type, pulse: 0 } satisfies PowerUpData);
  }

  private spawnExplosion(x: number, y: number, colorHex: string, count = 12): void {
    const colorNum = parseInt(colorHex.replace("#", ""), 16);
    this.explosionEmitter.setParticleTint(colorNum);
    this.explosionEmitter.explode(count, x, y);
  }

  private addFloatingText(x: number, y: number, text: string, color = "#ffffff"): void {
    const txt = this.add
      .text(x, y, text, {
        fontFamily: GAME_CANVAS_FONT,
        fontSize: "12px",
        fontStyle: "bold",
        color
      })
      .setOrigin(0.5)
      .setDepth(15);

    this.tweens.add({
      targets: txt,
      y: y - 42,
      alpha: 0,
      duration: 750,
      ease: "Linear",
      onComplete: () => txt.destroy()
    });
  }

  private triggerShake(intensity: number, durationMs: number): void {
    if (this.ui.shakeEnabled) {
      this.cameras.main.shake(durationMs, intensity / 800);
    }
    this.ui.shake(intensity, durationMs);
  }

  private updateHighScoreIfNeeded(): void {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.ui.saveHighScore(this.highScore);
    }
  }

  private cleanupOffscreen(): void {
    const W = GAME_CONFIG.CANVAS_WIDTH;
    const H = GAME_CONFIG.CANVAS_HEIGHT;

    for (const child of this.playerBullets.getChildren()) {
      const s = child as Phaser.Physics.Arcade.Sprite;
      if (s.active && (s.y < -20 || s.y > H + 20 || s.x < -20 || s.x > W + 20)) {
        s.disableBody(true, true);
      }
    }
    for (const child of this.enemies.getChildren()) {
      const s = child as Phaser.Physics.Arcade.Sprite;
      if (s.active && s.y > H + 40) {
        s.disableBody(true, true);
      }
    }
    for (const child of this.enemyBullets.getChildren()) {
      const s = child as Phaser.Physics.Arcade.Sprite;
      if (s.active && (s.y > H + 24 || s.y < -24 || s.x < -24 || s.x > W + 24)) {
        s.disableBody(true, true);
      }
    }
    for (const child of this.powerUps.getChildren()) {
      const s = child as Phaser.Physics.Arcade.Sprite;
      if (s.active && s.y > H + 30) {
        s.disableBody(true, true);
      }
    }
  }

  private updateCanvasOverlays(): void {
    const W = GAME_CONFIG.CANVAS_WIDTH;
    const H = GAME_CONFIG.CANVAS_HEIGHT;

    // 1. Thanh máu Boss (chỉ vẽ lại khi HP thay đổi)
    if (this.bossData && this.bossSprite) {
      const b = this.bossData;
      if (b.hp !== this.lastBossHpRendered) {
        this.lastBossHpRendered = b.hp;
        const enraged = b.hp <= b.maxHp * 0.5;
        const barW = 300;
        const barH = 12;
        const barX = (W - barW) / 2;
        const barY = 56;
        const ratio = Math.max(0, b.hp / b.maxHp);

        this.bossHpGraphics.clear();
        this.bossHpGraphics.fillStyle(0x020617, 0.85);
        this.bossHpGraphics.fillRect(barX - 6, barY - 4, barW + 12, barH + 22);
        this.bossHpGraphics.lineStyle(1, 0xf87171, 0.5);
        this.bossHpGraphics.strokeRect(barX - 6, barY - 4, barW + 12, barH + 22);

        this.bossHpGraphics.fillStyle(0x1e293b, 1);
        this.bossHpGraphics.fillRect(barX, barY + 11, barW, barH - 4);
        this.bossHpGraphics.fillStyle(enraged ? 0xef4444 : 0xf97316, 1);
        this.bossHpGraphics.fillRect(barX, barY + 11, barW * ratio, barH - 4);

        this.bossHpText.setText(`BOSS ĐỢT ${b.wave} (${b.hp}/${b.maxHp})`);
        this.bossHpText.setPosition(W / 2, barY + 9);
        this.bossHpText.setVisible(true);
      }
    } else if (this.lastBossHpRendered !== -1) {
      this.bossHpGraphics.clear();
      this.bossHpText.setVisible(false);
      this.lastBossHpRendered = -1;
    }

    // 2. Cảnh báo Boss (chỉ toggle visibility khi trạng thái nhấp nháy đổi)
    const warningVisible =
      this.simTime < this.bossWarningUntil && Math.floor(this.simTime / 180) % 2 !== 0;
    if (warningVisible !== this.lastWarningVisible) {
      this.lastWarningVisible = warningVisible;
      this.bossWarningGraphics.setVisible(warningVisible);
      this.bossWarningText.setVisible(warningVisible);
    }

    // 3. Chỉ báo Power-up (chỉ cập nhật khi số giây còn lại thay đổi — ~1 lần/giây)
    const weaponSec =
      this.weaponLevel > 1 && this.simTime < this.weaponBoostUntil
        ? Math.ceil((this.weaponBoostUntil - this.simTime) / 1000)
        : 0;
    const shieldSec =
      this.simTime < this.shieldUntil ? Math.ceil((this.shieldUntil - this.simTime) / 1000) : 0;
    const signature = `${weaponSec > 0 ? `${this.weaponLevel}:${weaponSec}` : ""}|${shieldSec}`;

    if (signature !== this.lastBadgesSignature) {
      this.lastBadgesSignature = signature;
      this.powerUpHudGraphics.clear();
      this.weaponBadgeText.setVisible(false);
      this.shieldBadgeText.setVisible(false);

      let y = H - 14;
      if (shieldSec > 0) {
        this.shieldBadgeText.setText(`Khiên: ${shieldSec}s`).setPosition(17, y).setVisible(true);
        const boxW = this.shieldBadgeText.width + 14;
        this.powerUpHudGraphics.fillStyle(0x020617, 0.84);
        this.powerUpHudGraphics.fillRect(10, y - 15, boxW, 18);
        this.powerUpHudGraphics.lineStyle(1, 0x22d3ee, 1);
        this.powerUpHudGraphics.strokeRect(10, y - 15, boxW, 18);
        y -= 22;
      }
      if (weaponSec > 0) {
        this.weaponBadgeText
          .setText(`Đạn ${this.weaponLevel} tia: ${weaponSec}s`)
          .setPosition(17, y)
          .setVisible(true);
        const boxW = this.weaponBadgeText.width + 14;
        this.powerUpHudGraphics.fillStyle(0x020617, 0.84);
        this.powerUpHudGraphics.fillRect(10, y - 15, boxW, 18);
        this.powerUpHudGraphics.lineStyle(1, 0xfacc15, 1);
        this.powerUpHudGraphics.strokeRect(10, y - 15, boxW, 18);
      }
    }
  }

  getRunSummary(): { score: number; wave: number; difficultyLabel: string; maxHp: number } {
    return {
      score: this.score,
      wave: this.wave,
      difficultyLabel: this.currentDifficulty.label,
      maxHp: this.playerMaxHp
    };
  }
}
