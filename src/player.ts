import { GAME_CONFIG } from "./config";
import { drawShipShape, SHIP_MODELS } from "./ships";
import type { BoundingBox, DifficultyConfig, InputState, ShipModel } from "./types";

export class PlayerBullet implements BoundingBox {
  width = GAME_CONFIG.BULLET.WIDTH;
  height = GAME_CONFIG.BULLET.HEIGHT;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  active = true;

  constructor(
    x: number,
    y: number,
    vx = 0,
    vy = -GAME_CONFIG.BULLET.SPEED,
    color = "#38bdf8"
  ) {
    this.x = x - this.width / 2;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
  }

  update(dtFactor: number): void {
    this.x += this.vx * dtFactor;
    this.y += this.vy * dtFactor;

    if (
      this.y + this.height < 0 ||
      this.y > GAME_CONFIG.CANVAS_HEIGHT + 20 ||
      this.x + this.width < -20 ||
      this.x > GAME_CONFIG.CANVAS_WIDTH + 20
    ) {
      this.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 8;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(this.x + 1, this.y + 2, this.width - 2, this.height - 4);
    ctx.restore();
  }
}

export class Player implements BoundingBox {
  width = GAME_CONFIG.PLAYER.WIDTH;
  height = GAME_CONFIG.PLAYER.HEIGHT;
  x = 0;
  y = 0;
  speed = GAME_CONFIG.PLAYER.SPEED;
  maxHp = GAME_CONFIG.PLAYER.MAX_HP;
  hp = GAME_CONFIG.PLAYER.MAX_HP;
  ship: ShipModel = SHIP_MODELS.phantom;
  shootCooldown = GAME_CONFIG.PLAYER.SHOOT_COOLDOWN_MS;
  autoFire = true;
  weaponLevel = 1;
  weaponBoostUntil = 0;
  shieldUntil = 0;
  lastShotTime = 0;
  invincibleUntil = 0;
  bullets: PlayerBullet[] = [];

  constructor() {
    this.reset();
  }

  applyDifficulty(diffConfig: DifficultyConfig): void {
    this.maxHp = diffConfig.playerMaxHp;
  }

  applyShip(ship: ShipModel): void {
    this.ship = ship;
    this.speed = GAME_CONFIG.PLAYER.SPEED * ship.speedMul;
    this.shootCooldown = GAME_CONFIG.PLAYER.SHOOT_COOLDOWN_MS * ship.cooldownMul;
    this.maxHp = Math.max(1, this.maxHp + ship.hpBonus);
  }

  reset(): void {
    this.x = (GAME_CONFIG.CANVAS_WIDTH - this.width) / 2;
    this.y = GAME_CONFIG.CANVAS_HEIGHT - this.height - 28;
    this.hp = this.maxHp;
    this.weaponLevel = 1;
    this.weaponBoostUntil = 0;
    this.shieldUntil = 0;
    this.lastShotTime = 0;
    this.invincibleUntil = 0;
    this.bullets = [];
  }

  clampPosition(): void {
    if (this.x < 8) this.x = 8;
    if (this.x + this.width > GAME_CONFIG.CANVAS_WIDTH - 8) {
      this.x = GAME_CONFIG.CANVAS_WIDTH - this.width - 8;
    }
    if (this.y < 12) this.y = 12;
    if (this.y + this.height > GAME_CONFIG.CANVAS_HEIGHT - 10) {
      this.y = GAME_CONFIG.CANVAS_HEIGHT - this.height - 10;
    }
  }

  moveTo(canvasX: number, canvasY: number): void {
    this.x = canvasX - this.width / 2;
    this.y = canvasY - this.height / 2;
    this.clampPosition();
  }

  upgradeWeapon(currentTime: number): number {
    this.weaponLevel = Math.min(3, this.weaponLevel + 1);
    this.weaponBoostUntil = currentTime + GAME_CONFIG.POWERUP.WEAPON_DURATION_MS;
    return this.weaponLevel;
  }

  activateShield(currentTime: number): void {
    this.shieldUntil = currentTime + GAME_CONFIG.POWERUP.SHIELD_DURATION_MS;
  }

  heal(amount = 1): boolean {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp > before;
  }

  hasShield(currentTime: number): boolean {
    return currentTime < this.shieldUntil;
  }

  private spawnBullets(): void {
    const cx = this.x + this.width / 2;
    const topY = this.y - 6;
    const speed = GAME_CONFIG.BULLET.SPEED;

    if (this.weaponLevel === 1) {
      this.bullets.push(new PlayerBullet(cx, topY, 0, -speed, "#38bdf8"));
    } else if (this.weaponLevel === 2) {
      this.bullets.push(new PlayerBullet(cx - 11, topY + 4, 0, -speed, "#facc15"));
      this.bullets.push(new PlayerBullet(cx + 11, topY + 4, 0, -speed, "#facc15"));
    } else {
      this.bullets.push(new PlayerBullet(cx, topY, 0, -speed, "#f472b6"));
      this.bullets.push(new PlayerBullet(cx - 10, topY + 6, -1.7, -speed * 0.96, "#f472b6"));
      this.bullets.push(new PlayerBullet(cx + 10, topY + 6, 1.7, -speed * 0.96, "#f472b6"));
    }
  }

  update(inputState: InputState, currentTime: number, dtFactor: number): boolean {
    if (this.weaponLevel > 1 && currentTime >= this.weaponBoostUntil) {
      this.weaponLevel = 1;
    }

    let moveX = 0;
    let moveY = 0;

    if (inputState.left) moveX -= 1;
    if (inputState.right) moveX += 1;
    if (inputState.up) moveY -= 1;
    if (inputState.down) moveY += 1;

    if (moveX !== 0 && moveY !== 0) {
      const invSqrt2 = 0.7071;
      moveX *= invSqrt2;
      moveY *= invSqrt2;
    }

    this.x += moveX * this.speed * dtFactor;
    this.y += moveY * this.speed * dtFactor;
    this.clampPosition();

    let didShoot = false;
    if (this.autoFire || inputState.shoot) {
      if (currentTime - this.lastShotTime >= this.shootCooldown) {
        this.spawnBullets();
        this.lastShotTime = currentTime;
        didShoot = true;
      }
    }

    for (const bullet of this.bullets) {
      bullet.update(dtFactor);
    }
    this.bullets = this.bullets.filter((b) => b.active);

    return didShoot;
  }

  takeDamage(currentTime: number): "ignored" | "shield" | "damaged" {
    if (currentTime < this.invincibleUntil) {
      return "ignored";
    }
    if (this.hasShield(currentTime)) {
      this.shieldUntil = 0;
      this.invincibleUntil = currentTime + 650;
      return "shield";
    }
    this.hp = Math.max(0, this.hp - 1);
    this.invincibleUntil = currentTime + GAME_CONFIG.PLAYER.INVINCIBLE_MS;
    return "damaged";
  }

  draw(ctx: CanvasRenderingContext2D, currentTime: number): void {
    for (const bullet of this.bullets) {
      bullet.draw(ctx);
    }

    if (currentTime < this.invincibleUntil && Math.floor(currentTime / 90) % 2 === 0) {
      return;
    }

    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;

    ctx.save();

    const wingColor = this.weaponLevel === 3 ? "#db2777" : this.weaponLevel === 2 ? "#ca8a04" : this.ship.wing;
    const bodyColor = this.weaponLevel === 3 ? "#f472b6" : this.weaponLevel === 2 ? "#facc15" : this.ship.body;
    drawShipShape(ctx, this.ship, this.x, this.y, this.width, this.height, { wing: wingColor, body: bodyColor });

    if (this.hasShield(currentTime)) {
      const remaining = this.shieldUntil - currentTime;
      const shouldDrawShield = remaining > 2000 || Math.floor(currentTime / 110) % 2 === 0;
      if (shouldDrawShield) {
        ctx.strokeStyle = "#22d3ee";
        ctx.fillStyle = "rgba(34, 211, 238, 0.14)";
        ctx.lineWidth = 2.5;
        ctx.shadowColor = "#22d3ee";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(this.width, this.height) * 0.68, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
  }
}
