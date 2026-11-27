export type DifficultyId = "easy" | "normal" | "hard";

export interface DifficultyConfig {
  id: DifficultyId;
  label: string;
  playerMaxHp: number;
  enemySpeedMul: number;
  spawnRateMul: number;
  enemyHpMul: number;
  bossHpMul: number;
  scoreMul: number;
}

export type ShipId = "phantom" | "falcon" | "titan";

export interface ShipModel {
  id: ShipId;
  name: string;
  desc: string;
  speedMul: number;
  hpBonus: number;
  cooldownMul: number;
  body: string;
  wing: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  normalSrc: string;
  underscoreSrc: string;
}

export type PowerUpType = "heal" | "weapon" | "shield";
export type EnemyType = "basic" | "zigzag";
export type GameState = "start" | "playing" | "paused" | "gameover";
export type ScreenState = "resetPrompt" | "start" | "playing" | "paused" | "settings" | "gameover";

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  shoot: boolean;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  wave: number;
  difficulty: string;
}

export interface AchievementStats {
  kills: number;
  bosses: number;
  powerups: number;
  blocks: number;
  games: number;
}

export interface AchievementRunState {
  score: number;
  wave: number;
  hit: boolean;
  difficulty: DifficultyId;
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  test: (stats: AchievementStats, run: AchievementRunState) => boolean;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
