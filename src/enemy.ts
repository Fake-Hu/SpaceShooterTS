import { GAME_CONFIG } from "./config";
import type { Player } from "./player";
import type { BoundingBox, DifficultyConfig, EnemyType, PowerUpType } from "./types";

const GAME_CANVAS_FONT = "Orbitron, Rajdhani, 'Segoe UI', sans-serif";

export class Enemy implements BoundingBox {
  type: EnemyType;
  width: number;
  height: number;
  x: number;
  y: number;
  speedY: number;
  hp: number;
  maxHp: number;
  scoreValue: number;
  baseX: number;
  angle: number;
  active = true;

  constructor(
    type: EnemyType = "basic",
    wave = 1,
    diffConfig: DifficultyConfig = GAME_CONFIG.DIFFICULTIES.normal
  ) {
    this.type = type;
    this.width = type === "zigzag" ? 40 : 36;
    this.height = type === "zigzag" ? 38 : 34;

    this.x = 16 + Math.random() * (GAME_CONFIG.CANVAS_WIDTH - this.width - 32);
    this.y = -this.height;

    const waveBonus = Math.min(2.2, (wave - 1) * 0.2);
    this.speedY = ((type === "zigzag" ? 2.4 : 2.8) + waveBonus) * diffConfig.enemySpeedMul;

    const baseHp = type === "zigzag" ? 2 : 1;
    this.hp = Math.max(1, Math.round(baseHp * diffConfig.enemyHpMul));
    this.maxHp = this.hp;

    const baseScore = type === "zigzag" ? 20 : GAME_CONFIG.ENEMY.SCORE_PER_KILL;
    this.scoreValue = Math.max(5, Math.round(baseScore * diffConfig.scoreMul));

    this.baseX = this.x;
    this.angle = Math.random() * Math.PI * 2;
  }

  update(dtFactor: number): void {
    this.y += this.speedY * dtFactor;

    if (this.type === "zigzag") {
      this.angle += 0.06 * dtFactor;
      this.x = this.baseX + Math.sin(this.angle) * 45;
      if (this.x < 8) this.x = 8;
      if (this.x + this.width > GAME_CONFIG.CANVAS_WIDTH - 8) {
        this.x = GAME_CONFIG.CANVAS_WIDTH - this.width - 8;
      }
    }

    if (this.y > GAME_CONFIG.CANVAS_HEIGHT + 20) {
      this.active = false;
    }
  }

  hit(): boolean {
    this.hp -= 1;
    if (this.hp <= 0) {
      this.active = false;
      return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;

    ctx.save();
    if (this.type === "zigzag") {
      ctx.fillStyle = this.hp < this.maxHp ? "#f472b6" : "#a855f7";
      ctx.beginPath();
      ctx.moveTo(cx, this.y + this.height);
      ctx.lineTo(this.x + this.width, cy);
      ctx.lineTo(cx, this.y);
      ctx.lineTo(this.x, cy);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = this.hp < this.maxHp ? "#fb923c" : "#ef4444";
      ctx.beginPath();
      ctx.moveTo(cx, this.y + this.height);
      ctx.lineTo(this.x + this.width, this.y + 6);
      ctx.lineTo(cx, this.y + 14);
      ctx.lineTo(this.x, this.y + 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fca5a5";
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

export class EnemyBullet implements BoundingBox {
  radius: number;
  width: number;
  height: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  active = true;

  constructor(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color = "#fb7185",
    radius = 5
  ) {
    this.radius = radius;
    this.width = radius * 2;
    this.height = radius * 2;
    this.x = x - radius;
    this.y = y - radius;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
  }

  update(dtFactor: number): void {
    this.x += this.vx * dtFactor;
    this.y += this.vy * dtFactor;

    if (
      this.y > GAME_CONFIG.CANVAS_HEIGHT + 24 ||
      this.y + this.height < -24 ||
      this.x + this.width < -24 ||
      this.x > GAME_CONFIG.CANVAS_WIDTH + 24
    ) {
      this.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const cx = this.x + this.radius;
    const cy = this.y + this.radius;
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff1f2";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, this.radius * 0.45), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export class Boss implements BoundingBox {
  wave: number;
  bossIndex: number;
  width = GAME_CONFIG.BOSS.WIDTH;
  height = GAME_CONFIG.BOSS.HEIGHT;
  x: number;
  y: number;
  targetY = 62;
  state: "entering" | "fighting" = "entering";
  dirX: number;
  speedX: number;
  hoverPhase = 0;
  maxHp: number;
  hp: number;
  scoreValue: number;
  lastShotTime = 0;
  shotCounter = 0;
  hitFlashUntil = 0;
  active = true;

  constructor(wave: number, bossIndex: number, diffConfig: DifficultyConfig) {
    this.wave = wave;
    this.bossIndex = bossIndex;
    this.x = (GAME_CONFIG.CANVAS_WIDTH - this.width) / 2;
    this.y = -this.height - 10;

    this.dirX = Math.random() < 0.5 ? -1 : 1;
    this.speedX = GAME_CONFIG.BOSS.SPEED_X * diffConfig.enemySpeedMul;

    const rawHp = GAME_CONFIG.BOSS.BASE_HP + (bossIndex - 1) * GAME_CONFIG.BOSS.HP_PER_APPEARANCE;
    this.maxHp = Math.max(15, Math.round(rawHp * diffConfig.bossHpMul));
    this.hp = this.maxHp;

    this.scoreValue = Math.round(GAME_CONFIG.BOSS.SCORE_REWARD * diffConfig.scoreMul);
  }

  isEnraged(): boolean {
    return this.hp <= this.maxHp * 0.5;
  }

  update(
    currentTime: number,
    dtFactor: number,
    player: Player,
    enemyBullets: EnemyBullet[]
  ): void {
    if (this.state === "entering") {
      this.y += 2.2 * dtFactor;
      if (this.y >= this.targetY) {
        this.y = this.targetY;
        this.state = "fighting";
        this.lastShotTime = currentTime - 300;
      }
      return;
    }

    const speedFactor = this.isEnraged() ? 1.25 : 1;
    this.x += this.dirX * this.speedX * speedFactor * dtFactor;
    if (this.x <= 14) {
      this.x = 14;
      this.dirX = 1;
    } else if (this.x + this.width >= GAME_CONFIG.CANVAS_WIDTH - 14) {
      this.x = GAME_CONFIG.CANVAS_WIDTH - this.width - 14;
      this.dirX = -1;
    }

    this.hoverPhase += 0.05 * dtFactor;
    this.y = this.targetY + Math.sin(this.hoverPhase) * 8;

    const shootInterval = this.isEnraged()
      ? GAME_CONFIG.BOSS.SHOOT_INTERVAL_MS * 0.75
      : GAME_CONFIG.BOSS.SHOOT_INTERVAL_MS;

    if (currentTime - this.lastShotTime >= shootInterval) {
      this.firePattern(player, enemyBullets);
      this.lastShotTime = currentTime;
    }
  }

  private firePattern(player: Player, enemyBullets: EnemyBullet[]): void {
    this.shotCounter += 1;
    const cx = this.x + this.width / 2;
    const muzzleY = this.y + this.height - 6;
    const bulletSpeed = GAME_CONFIG.BOSS.BULLET_SPEED;

    if (this.isEnraged() && this.shotCounter % 2 === 0) {
      const angles = [-0.46, -0.23, 0, 0.23, 0.46];
      for (const a of angles) {
        enemyBullets.push(
          new EnemyBullet(cx, muzzleY, Math.sin(a) * bulletSpeed, Math.cos(a) * bulletSpeed, "#f97316", 6)
        );
      }
      return;
    }

    if (this.shotCounter % 2 === 1) {
      const px = player.x + player.width / 2;
      const py = player.y + player.height / 2;
      const baseAngle = Math.atan2(py - muzzleY, px - cx);
      for (const offset of [-0.18, 0, 0.18]) {
        const angle = baseAngle + offset;
        enemyBullets.push(
          new EnemyBullet(cx, muzzleY, Math.cos(angle) * bulletSpeed, Math.sin(angle) * bulletSpeed, "#fb7185", 5)
        );
      }
    } else {
      enemyBullets.push(new EnemyBullet(this.x + 22, muzzleY - 4, 0, bulletSpeed * 1.05, "#fb7185", 5));
      enemyBullets.push(
        new EnemyBullet(this.x + this.width - 22, muzzleY - 4, 0, bulletSpeed * 1.05, "#fb7185", 5)
      );
    }
  }

  hit(currentTime: number): boolean {
    this.hp -= 1;
    this.hitFlashUntil = currentTime + 70;
    if (this.hp <= 0) {
      this.active = false;
      return true;
    }
    return false;
  }

  draw(ctx: CanvasRenderingContext2D, currentTime: number): void {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    const isFlashing = currentTime < this.hitFlashUntil;
    const enraged = this.isEnraged();

    ctx.save();

    ctx.fillStyle = isFlashing ? "#fde047" : enraged ? "#991b1b" : "#7e22ce";
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + 18);
    ctx.lineTo(this.x + this.width, this.y + 18);
    ctx.lineTo(this.x + this.width - 14, this.y + this.height - 12);
    ctx.lineTo(cx, this.y + this.height);
    ctx.lineTo(this.x + 14, this.y + this.height - 12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = isFlashing ? "#ffffff" : enraged ? "#ef4444" : "#a855f7";
    ctx.beginPath();
    ctx.moveTo(cx - 26, this.y + 6);
    ctx.lineTo(cx + 26, this.y + 6);
    ctx.lineTo(cx + 34, this.y + this.height - 16);
    ctx.lineTo(cx, this.y + this.height - 2);
    ctx.lineTo(cx - 34, this.y + this.height - 16);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(this.x + 18, this.y + this.height - 20, 8, 16);
    ctx.fillRect(this.x + this.width - 26, this.y + this.height - 20, 8, 16);

    ctx.fillStyle = enraged ? "#fde047" : "#38bdf8";
    ctx.shadowColor = enraged ? "#f97316" : "#38bdf8";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    this.drawHealthBar(ctx);
  }

  private drawHealthBar(ctx: CanvasRenderingContext2D): void {
    const barW = 300;
    const barH = 12;
    const barX = (GAME_CONFIG.CANVAS_WIDTH - barW) / 2;
    const barY = 56;
    const ratio = Math.max(0, this.hp / this.maxHp);

    ctx.save();
    ctx.fillStyle = "rgba(2, 6, 23, 0.85)";
    ctx.fillRect(barX - 6, barY - 4, barW + 12, barH + 22);
    ctx.strokeStyle = "rgba(248, 113, 113, 0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX - 6, barY - 4, barW + 12, barH + 22);

    ctx.fillStyle = "#fca5a5";
    ctx.font = `bold 10px ${GAME_CANVAS_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(`BOSS ĐỢT ${this.wave} (${this.hp}/${this.maxHp})`, GAME_CONFIG.CANVAS_WIDTH / 2, barY + 7);

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(barX, barY + 11, barW, barH - 4);

    ctx.fillStyle = this.isEnraged() ? "#ef4444" : "#f97316";
    ctx.fillRect(barX, barY + 11, barW * ratio, barH - 4);
    ctx.restore();
  }
}

export class PowerUp implements BoundingBox {
  width = GAME_CONFIG.POWERUP.SIZE;
  height = GAME_CONFIG.POWERUP.SIZE;
  x: number;
  y: number;
  type: PowerUpType;
  speedY = GAME_CONFIG.POWERUP.SPEED_Y;
  pulse = 0;
  active = true;

  constructor(x: number, y: number, type: PowerUpType) {
    this.x = Math.max(10, Math.min(GAME_CONFIG.CANVAS_WIDTH - this.width - 10, x - this.width / 2));
    this.y = y - this.height / 2;
    this.type = type;
  }

  update(dtFactor: number): void {
    this.y += this.speedY * dtFactor;
    this.pulse += 0.1 * dtFactor;
    if (this.y > GAME_CONFIG.CANVAS_HEIGHT + 24) {
      this.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    const radius = this.width / 2 + Math.sin(this.pulse) * 1.5;

    let color = "#22c55e";
    let label = "+";
    if (this.type === "weapon") {
      color = "#facc15";
      label = "W";
    } else if (this.type === "shield") {
      color = "#22d3ee";
      label = "S";
    }

    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.font = `bold 14px ${GAME_CANVAS_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, cx, cy + 1);
    ctx.restore();
  }
}

export class FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  alpha = 1;

  constructor(x: number, y: number, text: string, color = "#ffffff") {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
  }

  update(dtFactor: number): void {
    this.y -= 0.9 * dtFactor;
    this.alpha -= 0.022 * dtFactor;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.fillStyle = this.color;
    ctx.font = `bold 12px ${GAME_CANVAS_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

export class ExplosionParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha = 1;
  color: string;

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 3.5;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.radius = 2 + Math.random() * 3;
    this.color = color;
  }

  update(dtFactor: number): void {
    this.x += this.vx * dtFactor;
    this.y += this.vy * dtFactor;
    this.alpha -= 0.03 * dtFactor;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
