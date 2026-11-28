import Phaser from "phaser";

interface StarItem {
  sprite: Phaser.GameObjects.Image;
  speed: number;
}

interface MicroStarItem {
  sprite: Phaser.GameObjects.Image;
  baseAlpha: number;
  phase: number;
  speed: number;
}

interface NebulaItem {
  sprite: Phaser.GameObjects.Image;
  speedY: number;
  boundH: number;
}

interface PlanetItem {
  sprite: Phaser.GameObjects.Image;
  speedY: number;
  boundR: number;
}

interface ShootingStarState {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  baseAlpha: number;
  active: boolean;
}

const BAND_PALETTES: Array<[number, number]> = [
  [0x38bdf8, 0x6366f1],
  [0xa855f7, 0x3b82f6],
  [0x14b8a6, 0x818cf8],
  [0xec4899, 0x6366f1]
];

export class PhaserBackground {
  private scene: Phaser.Scene;
  private width: number;
  private height: number;

  private bandContainer: Phaser.GameObjects.Container;
  private microStars: MicroStarItem[] = [];
  private nebulae: NebulaItem[] = [];
  private planets: PlanetItem[] = [];
  private stars: StarItem[] = [];
  private shootingStar: ShootingStarState;

  private nextNebulaTimer = 0;
  private nextPlanetTimer = 0;
  private nextShootingStarTimer = 0;

  constructor(scene: Phaser.Scene, width: number, height: number) {
    this.scene = scene;
    this.width = width;
    this.height = height;

    this.bandContainer = scene.add.container(width * 0.5, height * 0.5).setDepth(-15);

    const ssSprite = scene.add.image(-100, -100, "bg_shooting_star").setDepth(-11).setVisible(false);
    this.shootingStar = {
      sprite: ssSprite,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 1,
      baseAlpha: 0.45,
      active: false
    };

    this.initStaticStarfield();
    this.reset();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  private rand(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private initStaticStarfield(): void {
    for (let i = 0; i < 65; i++) {
      const large = Math.random() < 0.3;
      const sprite = this.scene.add
        .image(Math.random() * this.width, Math.random() * this.height, "bg_star")
        .setDepth(-12)
        .setScale(large ? 0.5 : 0.3)
        .setAlpha(large ? 0.85 : 0.45);
      this.stars.push({
        sprite,
        speed: 0.6 + Math.random() * 1.8
      });
    }
  }

  reset(): void {
    // Dải ngân hà (Container + 7 đám mây cache + 45 sao nhỏ)
    this.bandContainer.removeAll(true);
    this.microStars = [];

    const palette = BAND_PALETTES[Math.floor(Math.random() * BAND_PALETTES.length)];
    const bandWidth = this.rand(110, 165);
    this.bandContainer.setPosition(
      this.rand(this.width * 0.25, this.width * 0.75),
      this.height * 0.5
    );
    this.bandContainer.setRotation(this.rand(-0.55, 0.55));

    const cloudCount = 7;
    for (let i = 0; i < cloudCount; i++) {
      const t = i / (cloudCount - 1) - 0.5;
      const radius = this.rand(bandWidth * 0.7, bandWidth * 1.15);
      const cloud = this.scene.add
        .image(
          this.rand(-bandWidth * 0.35, bandWidth * 0.35),
          t * this.height * 1.15 + this.rand(-30, 30),
          "bg_band_cloud"
        )
        .setTint(i % 2 === 0 ? palette[0] : palette[1])
        .setAlpha(this.rand(0.045, 0.08))
        .setScale((radius * 2) / 220);
      this.bandContainer.add(cloud);
    }

    for (let i = 0; i < 45; i++) {
      const spread = (Math.random() + Math.random() - 1) * bandWidth * 0.65;
      const baseAlpha = this.rand(0.14, 0.38);
      const ms = this.scene.add
        .image(spread, this.rand(-this.height * 0.75, this.height * 0.75), "bg_star")
        .setScale(this.rand(0.18, 0.32))
        .setAlpha(baseAlpha);
      this.bandContainer.add(ms);
      this.microStars.push({
        sprite: ms,
        baseAlpha,
        phase: this.rand(0, Math.PI * 2),
        speed: this.rand(0.015, 0.04)
      });
    }

    // Xóa tinh vân & hành tinh cũ
    for (const n of this.nebulae) n.sprite.destroy();
    for (const p of this.planets) p.sprite.destroy();
    this.nebulae = [];
    this.planets = [];

    const initialNebulae = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < initialNebulae; i++) {
      this.spawnNebula(this.rand(50, this.height - 80));
    }
    if (Math.random() < 0.45) {
      this.spawnPlanet(this.rand(40, this.height * 0.45));
    }

    this.shootingStar.active = false;
    this.shootingStar.sprite.setVisible(false);

    this.nextNebulaTimer = this.rand(140, 420);
    this.nextPlanetTimer = this.rand(240, 780);
    this.nextShootingStarTimer = this.rand(120, 420);
  }

  private spawnNebula(yOverride: number | null = null): void {
    const texIdx = Math.floor(Math.random() * 4);
    const scaleX = this.rand(0.8, 1.45);
    const scaleY = this.rand(0.7, 1.25);
    const radius = this.rand(110, 200);
    const displayScaleX = (radius * 2 * scaleX) / 256;
    const displayScaleY = (radius * 2 * scaleY) / 256;
    const boundH = radius * Math.max(scaleX, scaleY);

    const sprite = this.scene.add
      .image(
        this.rand(20, this.width - 20),
        yOverride !== null ? yOverride : -boundH - this.rand(20, 100),
        `bg_nebula_${texIdx}`
      )
      .setDepth(-14)
      .setScale(displayScaleX, displayScaleY)
      .setRotation(this.rand(0, Math.PI * 2))
      .setAlpha(this.rand(0.055, 0.11));

    this.nebulae.push({
      sprite,
      speedY: this.rand(0.11, 0.25),
      boundH
    });
  }

  private spawnPlanet(yOverride: number | null = null): void {
    const idx = Math.floor(Math.random() * 6);
    const radius = this.rand(22, 54);
    const scale = radius / 50;
    const sprite = this.scene.add
      .image(
        this.rand(radius + 16, this.width - radius - 16),
        yOverride !== null ? yOverride : -radius - this.rand(35, 90),
        `bg_planet_${idx}`
      )
      .setDepth(-13)
      .setScale(scale)
      .setRotation(this.rand(-0.55, 0.55))
      .setAlpha(this.rand(0.17, 0.28));

    this.planets.push({
      sprite,
      speedY: this.rand(0.18, 0.38),
      boundR: radius
    });
  }

  private triggerShootingStar(): void {
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? this.rand(-20, this.width * 0.45) : this.rand(this.width * 0.55, this.width + 20);
    const startY = this.rand(15, this.height * 0.48);
    const speed = this.rand(7.5, 13);
    const angle = fromLeft ? this.rand(0.4, 0.9) : this.rand(Math.PI - 0.9, Math.PI - 0.4);

    const ss = this.shootingStar;
    ss.vx = Math.cos(angle) * speed;
    ss.vy = Math.sin(angle) * speed;
    ss.life = 0;
    ss.maxLife = this.rand(26, 46);
    ss.baseAlpha = this.rand(0.35, 0.58);
    ss.active = true;
    ss.sprite
      .setPosition(startX, startY)
      .setRotation(angle)
      .setScale(this.rand(0.55, 1), 1)
      .setAlpha(0)
      .setVisible(true);
  }

  update(dtFactor: number, shouldMove: boolean): void {
    if (!shouldMove) return;

    // Micro stars twinkle
    for (const ms of this.microStars) {
      ms.phase += ms.speed * dtFactor;
      ms.sprite.setAlpha(ms.baseAlpha * (0.65 + 0.35 * Math.sin(ms.phase)));
    }

    // Nebulae
    this.nextNebulaTimer -= dtFactor;
    if (this.nextNebulaTimer <= 0 && this.nebulae.length < 3) {
      this.spawnNebula();
      this.nextNebulaTimer = this.rand(240, 560);
    }
    for (let i = this.nebulae.length - 1; i >= 0; i--) {
      const neb = this.nebulae[i];
      neb.sprite.y += neb.speedY * dtFactor;
      if (neb.sprite.y - neb.boundH > this.height + 50) {
        neb.sprite.destroy();
        this.nebulae.splice(i, 1);
      }
    }

    // Planets
    this.nextPlanetTimer -= dtFactor;
    if (this.nextPlanetTimer <= 0 && this.planets.length < 2) {
      this.spawnPlanet();
      this.nextPlanetTimer = this.rand(600, 1440);
    }
    for (let i = this.planets.length - 1; i >= 0; i--) {
      const p = this.planets[i];
      p.sprite.y += p.speedY * dtFactor;
      if (p.sprite.y - p.boundR - 40 > this.height) {
        p.sprite.destroy();
        this.planets.splice(i, 1);
      }
    }

    // Parallax stars
    for (const star of this.stars) {
      star.sprite.y += star.speed * dtFactor;
      if (star.sprite.y > this.height + 4) {
        star.sprite.y = -4;
        star.sprite.x = Math.random() * this.width;
      }
    }

    // Shooting star
    const ss = this.shootingStar;
    if (!ss.active) {
      this.nextShootingStarTimer -= dtFactor;
      if (this.nextShootingStarTimer <= 0) {
        this.triggerShootingStar();
        this.nextShootingStarTimer = this.rand(220, 620);
      }
    } else {
      ss.sprite.x += ss.vx * dtFactor;
      ss.sprite.y += ss.vy * dtFactor;
      ss.life += dtFactor;
      const progress = ss.life / ss.maxLife;
      const fade = progress < 0.2 ? progress / 0.2 : Math.max(0, 1 - (progress - 0.2) / 0.8);
      ss.sprite.setAlpha(ss.baseAlpha * fade);
      if (ss.life >= ss.maxLife) {
        ss.active = false;
        ss.sprite.setVisible(false);
      }
    }
  }
}
