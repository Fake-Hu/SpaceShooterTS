import type { DifficultyConfig, DifficultyId, MusicTrack } from "./types";

export const GAME_CONFIG = {
  CANVAS_WIDTH: 480,
  CANVAS_HEIGHT: 680,

  PLAYER: {
    WIDTH: 44,
    HEIGHT: 48,
    SPEED: 5.2,
    MAX_HP: 3,
    SHOOT_COOLDOWN_MS: 180,
    INVINCIBLE_MS: 1200
  },

  BULLET: {
    WIDTH: 5,
    HEIGHT: 16,
    SPEED: 9
  },

  ENEMY: {
    BASE_SPAWN_MS: 1100,
    MIN_SPAWN_MS: 380,
    SCORE_PER_KILL: 10
  },

  DIFFICULTIES: {
    easy: {
      id: "easy",
      label: "Dễ",
      playerMaxHp: 5,
      enemySpeedMul: 0.8,
      spawnRateMul: 1.25,
      enemyHpMul: 1.0,
      bossHpMul: 0.75,
      scoreMul: 0.8
    },
    normal: {
      id: "normal",
      label: "Thường",
      playerMaxHp: 3,
      enemySpeedMul: 1.0,
      spawnRateMul: 1.0,
      enemyHpMul: 1.0,
      bossHpMul: 1.0,
      scoreMul: 1.0
    },
    hard: {
      id: "hard",
      label: "Khó",
      playerMaxHp: 2,
      enemySpeedMul: 1.25,
      spawnRateMul: 0.8,
      enemyHpMul: 1.5,
      bossHpMul: 1.35,
      scoreMul: 1.5
    }
  } satisfies Record<DifficultyId, DifficultyConfig>,

  BOSS: {
    EVERY_WAVES: 5,
    WIDTH: 112,
    HEIGHT: 76,
    BASE_HP: 36,
    HP_PER_APPEARANCE: 22,
    SPEED_X: 2.2,
    SHOOT_INTERVAL_MS: 1150,
    BULLET_SPEED: 4.4,
    SCORE_REWARD: 150
  },

  POWERUP: {
    SIZE: 28,
    SPEED_Y: 2.1,
    DROP_CHANCE: 0.22,
    WEAPON_DURATION_MS: 10000,
    SHIELD_DURATION_MS: 8000
  },

  HIGH_SCORE_KEY: "space_shooter_cntt_highscore",
  LEADERBOARD_KEY: "space_shooter_cntt_leaderboard_v2",
  LEADERBOARD_LIMIT: 5,
  LAST_PLAYER_NAME_KEY: "space_shooter_cntt_last_name",
  SOUND_MUTED_KEY: "space_shooter_cntt_muted",
  SOUND_VOLUME_KEY: "space_shooter_cntt_volume",

  MUSIC: {
    VOLUME: 0.45,
    CROSSFADE_MS: 600,
    SYNC_THRESHOLD_SEC: 0.04,
    NOW_PLAYING_DURATION_MS: 3000,
    TRACKS: [
      {
        id: "ablaze",
        title: "Ablaze",
        normalSrc: "audio/tracks/ablaze/normal.mp3",
        underscoreSrc: "audio/tracks/ablaze/underscore.mp3"
      },
      {
        id: "bewitched",
        title: "Bewitched",
        normalSrc: "audio/tracks/bewitched/normal.mp3",
        underscoreSrc: "audio/tracks/bewitched/underscore.mp3"
      },
      {
        id: "dead-center",
        title: "Dead Center",
        normalSrc: "audio/tracks/dead-center/normal.mp3",
        underscoreSrc: "audio/tracks/dead-center/underscore.mp3"
      },
      {
        id: "death-sentence",
        title: "Death Sentence",
        normalSrc: "audio/tracks/death-sentence/normal.mp3",
        underscoreSrc: "audio/tracks/death-sentence/underscore.mp3"
      },
      {
        id: "dissonant",
        title: "Dissonant",
        normalSrc: "audio/tracks/dissonant/normal.mp3",
        underscoreSrc: "audio/tracks/dissonant/underscore.mp3"
      },
      {
        id: "dwellers-fury",
        title: "Dweller's Fury",
        normalSrc: "audio/tracks/dwellers-fury/normal.mp3",
        underscoreSrc: "audio/tracks/dwellers-fury/underscore.mp3"
      },
      {
        id: "imperishable-valour",
        title: "Imperishable Valour",
        normalSrc: "audio/tracks/imperishable-valour/normal.mp3",
        underscoreSrc: "audio/tracks/imperishable-valour/underscore.mp3"
      },
      {
        id: "powerplay",
        title: "Powerplay",
        normalSrc: "audio/tracks/powerplay/normal.mp3",
        underscoreSrc: "audio/tracks/powerplay/underscore.mp3"
      },
      {
        id: "voltaic-dispatch",
        title: "Voltaic Dispatch",
        normalSrc: "audio/tracks/voltaic-dispatch/normal.mp3",
        underscoreSrc: "audio/tracks/voltaic-dispatch/underscore.mp3"
      }
    ] satisfies MusicTrack[]
  }
};
