import Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import { drawShipShape, SHIP_MODELS } from "../ships";
import type { ShipId } from "../types";

export function shipTextureKey(shipId: ShipId, weaponLevel: number): string {
  return `ship_${shipId}_lv${weaponLevel}`;
}

function createCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, width, height);
  if (!tex) return;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, width, height);
  draw(ctx);
  tex.refresh();
}

export function generateGameTextures(scene: Phaser.Scene): void {
  // 1. Phi thuyền theo từng mẫu và cấp vũ khí (1, 2, 3)
  const w = GAME_CONFIG.PLAYER.WIDTH;
  const h = GAME_CONFIG.PLAYER.HEIGHT;
  for (const ship of Object.values(SHIP_MODELS)) {
    for (const lv of [1, 2, 3]) {
      const wingColor = lv === 3 ? "#db2777" : lv === 2 ? "#ca8a04" : ship.wing;
      const bodyColor = lv === 3 ? "#f472b6" : lv === 2 ? "#facc15" : ship.body;
      createCanvasTexture(scene, shipTextureKey(ship.id, lv), w, h + 16, (ctx) => {
        drawShipShape(ctx, ship, 0, 0, w, h, {
          wing: wingColor,
          body: bodyColor,
          flameLen: 12
        });
      });
    }
  }

  // 2. Đạn người chơi (3 màu theo cấp vũ khí)
  const bulletColors: Array<{ key: string; color: string }> = [
    { key: "bullet_lv1", color: "#38bdf8" },
    { key: "bullet_lv2", color: "#facc15" },
    { key: "bullet_lv3", color: "#f472b6" }
  ];
  const bw = GAME_CONFIG.BULLET.WIDTH;
  const bh = GAME_CONFIG.BULLET.HEIGHT;
  for (const b of bulletColors) {
    createCanvasTexture(scene, b.key, bw + 6, bh + 6, (ctx) => {
      ctx.save();
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 6;
      ctx.fillRect(3, 3, bw, bh);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(4, 5, bw - 2, bh - 4);
      ctx.restore();
    });
  }

  // 3. Địch Basic (bình thường & bị thương)
  const drawBasicEnemy = (key: string, bodyColor: string) => {
    createCanvasTexture(scene, key, 36, 34, (ctx) => {
      const cx = 18;
      const cy = 17;
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.moveTo(cx, 34);
      ctx.lineTo(36, 6);
      ctx.lineTo(cx, 14);
      ctx.lineTo(0, 6);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fca5a5";
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    });
  };
  drawBasicEnemy("enemy_basic", "#ef4444");
  drawBasicEnemy("enemy_basic_hit", "#fb923c");

  // 4. Địch Zigzag (bình thường & bị thương)
  const drawZigzagEnemy = (key: string, bodyColor: string) => {
    createCanvasTexture(scene, key, 40, 38, (ctx) => {
      const cx = 20;
      const cy = 19;
      ctx.fillStyle = bodyColor;
      ctx.beginPath();
      ctx.moveTo(cx, 38);
      ctx.lineTo(40, cy);
      ctx.lineTo(cx, 0);
      ctx.lineTo(0, cy);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#fde047";
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  };
  drawZigzagEnemy("enemy_zigzag", "#a855f7");
  drawZigzagEnemy("enemy_zigzag_hit", "#f472b6");

  // 5. Đạn địch
  const drawEnemyBullet = (key: string, color: string, radius: number) => {
    const size = radius * 2 + 8;
    const c = size / 2;
    createCanvasTexture(scene, key, size, size, (ctx) => {
      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(c, c, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff1f2";
      ctx.beginPath();
      ctx.arc(c, c, Math.max(2, radius * 0.45), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  };
  drawEnemyBullet("ebullet_pink", "#fb7185", 5);
  drawEnemyBullet("ebullet_orange", "#f97316", 6);

  // 6. Boss (thường, cuồng nộ, nháy trúng đạn)
  const bossW = GAME_CONFIG.BOSS.WIDTH;
  const bossH = GAME_CONFIG.BOSS.HEIGHT;
  const drawBoss = (key: string, outer: string, inner: string, core: string) => {
    createCanvasTexture(scene, key, bossW, bossH, (ctx) => {
      const cx = bossW / 2;
      const cy = bossH / 2;

      ctx.fillStyle = outer;
      ctx.beginPath();
      ctx.moveTo(0, 18);
      ctx.lineTo(bossW, 18);
      ctx.lineTo(bossW - 14, bossH - 12);
      ctx.lineTo(cx, bossH);
      ctx.lineTo(14, bossH - 12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.moveTo(cx - 26, 6);
      ctx.lineTo(cx + 26, 6);
      ctx.lineTo(cx + 34, bossH - 16);
      ctx.lineTo(cx, bossH - 2);
      ctx.lineTo(cx - 34, bossH - 16);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(18, bossH - 20, 8, 16);
      ctx.fillRect(bossW - 26, bossH - 20, 8, 16);

      ctx.save();
      ctx.fillStyle = core;
      ctx.shadowColor = core;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(cx, cy - 2, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  };
  drawBoss("boss_normal", "#7e22ce", "#a855f7", "#38bdf8");
  drawBoss("boss_enraged", "#991b1b", "#ef4444", "#fde047");
  drawBoss("boss_flash", "#fde047", "#ffffff", "#fde047");

  // 7. Power-up (heal, weapon, shield)
  const pSize = GAME_CONFIG.POWERUP.SIZE + 8;
  const drawPowerUp = (key: string, color: string, label: string) => {
    createCanvasTexture(scene, key, pSize, pSize, (ctx) => {
      const c = pSize / 2;
      const r = GAME_CONFIG.POWERUP.SIZE / 2;
      ctx.save();
      ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = color;
      ctx.font = "bold 14px Orbitron, 'Segoe UI', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, c, c + 1);
      ctx.restore();
    });
  };
  drawPowerUp("powerup_heal", "#22c55e", "+");
  drawPowerUp("powerup_weapon", "#facc15", "W");
  drawPowerUp("powerup_shield", "#22d3ee", "S");

  // 8. Hạt nổ (particle)
  createCanvasTexture(scene, "particle_dot", 8, 8, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(4, 4, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}
