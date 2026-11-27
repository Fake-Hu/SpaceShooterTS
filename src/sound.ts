import { GAME_CONFIG } from "./config";
import type { MusicTrack, PowerUpType } from "./types";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export class SoundManager {
  private ctx: AudioContext | null = null;
  muted: boolean;
  masterVolume: number;

  private musicVolume: number;
  private crossfadeMs: number;
  private syncThresholdSec: number;
  private tracks: MusicTrack[];

  private currentTrack: MusicTrack | null = null;
  private lastTrackId: string | null = null;
  private normalAudio: HTMLAudioElement | null = null;
  private underscoreAudio: HTMLAudioElement | null = null;

  private musicActive = false;
  private musicPaused = false;
  private isBossMusic = false;
  private musicBlend = 0; // 0 = underscore, 1 = normal
  private lastMusicTick = 0;
  private lastSyncCheck = 0;
  private rafId: number | null = null;

  constructor() {
    this.muted = this.loadMutedState();
    this.masterVolume = this.loadVolumeState();

    const musicCfg = GAME_CONFIG.MUSIC;
    this.musicVolume = musicCfg.VOLUME;
    this.crossfadeMs = musicCfg.CROSSFADE_MS;
    this.syncThresholdSec = musicCfg.SYNC_THRESHOLD_SEC;
    this.tracks = musicCfg.TRACKS;
  }

  private createMusicTrack(src: string): HTMLAudioElement {
    const audio = new Audio(src);
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0;
    audio.muted = this.muted;
    audio.addEventListener("loadedmetadata", () => {
      if (this.musicActive && !this.musicPaused) {
        this.syncTracks(true);
      }
    });
    return audio;
  }

  private disposeAudioPair(): void {
    for (const audio of [this.normalAudio, this.underscoreAudio]) {
      if (!audio) continue;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    this.normalAudio = null;
    this.underscoreAudio = null;
  }

  private loadTrackPair(track: MusicTrack): void {
    this.disposeAudioPair();
    this.currentTrack = track;
    this.lastTrackId = track.id;
    this.normalAudio = this.createMusicTrack(track.normalSrc);
    this.underscoreAudio = this.createMusicTrack(track.underscoreSrc);
  }

  getTrackById(trackId: string | null): MusicTrack | null {
    if (!trackId) return null;
    return this.tracks.find((t) => t.id === trackId) ?? null;
  }

  selectRandomTrack(): MusicTrack {
    if (this.tracks.length === 1) return this.tracks[0];
    const candidates = this.tracks.filter((t) => t.id !== this.lastTrackId);
    const pool = candidates.length > 0 ? candidates : this.tracks;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  getCurrentTrackTitle(): string {
    return this.currentTrack ? this.currentTrack.title : "";
  }

  private applyMusicVolumes(): void {
    if (!this.normalAudio || !this.underscoreAudio) return;
    const effectiveMusicVol = this.musicVolume * this.masterVolume;
    const normalVol = Math.max(0, Math.min(1, effectiveMusicVol * this.musicBlend));
    const underVol = Math.max(0, Math.min(1, effectiveMusicVol * (1 - this.musicBlend)));
    this.normalAudio.volume = normalVol;
    this.underscoreAudio.volume = underVol;
    this.normalAudio.muted = this.muted;
    this.underscoreAudio.muted = this.muted;
  }

  loadVolumeState(): number {
    try {
      const raw = localStorage.getItem(GAME_CONFIG.SOUND_VOLUME_KEY);
      if (raw === null) return 1;
      const val = parseFloat(raw);
      return Number.isFinite(val) ? Math.max(0, Math.min(1, val)) : 1;
    } catch {
      return 1;
    }
  }

  saveVolumeState(): void {
    try {
      localStorage.setItem(GAME_CONFIG.SOUND_VOLUME_KEY, String(this.masterVolume));
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage
    }
  }

  setMasterVolume(vol01: number): number {
    this.masterVolume = Math.max(0, Math.min(1, vol01));
    this.saveVolumeState();
    this.applyMusicVolumes();
    return this.masterVolume;
  }

  private syncTracks(forceTargetToActive = true): void {
    if (!this.normalAudio || !this.underscoreAudio) return;
    const active = this.isBossMusic ? this.normalAudio : this.underscoreAudio;
    const inactive = this.isBossMusic ? this.underscoreAudio : this.normalAudio;

    if (active.readyState < 1 || inactive.readyState < 1) return;

    const drift = Math.abs(active.currentTime - inactive.currentTime);
    if (drift > this.syncThresholdSec) {
      if (forceTargetToActive) {
        inactive.currentTime = active.currentTime;
      } else {
        active.currentTime = inactive.currentTime;
      }
    }
  }

  private startMusicLoop(): void {
    if (this.rafId !== null) return;
    this.lastMusicTick = performance.now();
    const tick = (now: number) => {
      if (!this.musicActive || this.musicPaused) {
        this.rafId = null;
        return;
      }

      const dtMs = Math.min(100, Math.max(0, now - this.lastMusicTick));
      this.lastMusicTick = now;

      const targetBlend = this.isBossMusic ? 1 : 0;
      if (this.musicBlend !== targetBlend) {
        const step = this.crossfadeMs > 0 ? dtMs / this.crossfadeMs : 1;
        if (this.musicBlend < targetBlend) {
          this.musicBlend = Math.min(targetBlend, this.musicBlend + step);
        } else {
          this.musicBlend = Math.max(targetBlend, this.musicBlend - step);
        }
        this.applyMusicVolumes();
      }

      if (now - this.lastSyncCheck >= 500) {
        this.lastSyncCheck = now;
        this.syncTracks(true);
      }

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopMusicLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  startMusic(isBossActive = false, trackId: string | null = null): MusicTrack {
    const track = this.getTrackById(trackId) || this.selectRandomTrack();
    this.loadTrackPair(track);

    this.musicActive = true;
    this.musicPaused = false;
    this.isBossMusic = Boolean(isBossActive);
    this.musicBlend = this.isBossMusic ? 1 : 0;

    try {
      if (this.normalAudio) this.normalAudio.currentTime = 0;
      if (this.underscoreAudio) this.underscoreAudio.currentTime = 0;
    } catch {
      // Bỏ qua nếu metadata chưa nạp xong
    }

    this.applyMusicVolumes();
    this.normalAudio?.play().catch(() => {});
    this.underscoreAudio?.play().catch(() => {});
    this.lastSyncCheck = performance.now();
    this.startMusicLoop();
    return track;
  }

  setBossMusic(isBossActive: boolean): void {
    const nextState = Boolean(isBossActive);
    if (this.isBossMusic === nextState) return;

    if (this.normalAudio && this.underscoreAudio) {
      const prevActive = this.isBossMusic ? this.normalAudio : this.underscoreAudio;
      const nextActive = nextState ? this.normalAudio : this.underscoreAudio;
      if (prevActive.readyState >= 1 && nextActive.readyState >= 1) {
        if (Math.abs(prevActive.currentTime - nextActive.currentTime) > 0.02) {
          nextActive.currentTime = prevActive.currentTime;
        }
      }
    }

    this.isBossMusic = nextState;
    if (this.musicActive && !this.musicPaused && this.normalAudio && this.underscoreAudio) {
      if (this.normalAudio.paused) this.normalAudio.play().catch(() => {});
      if (this.underscoreAudio.paused) this.underscoreAudio.play().catch(() => {});
      this.startMusicLoop();
    }
  }

  pauseMusic(): void {
    if (!this.musicActive || this.musicPaused) return;
    this.musicPaused = true;
    this.stopMusicLoop();
    this.normalAudio?.pause();
    this.underscoreAudio?.pause();
  }

  resumeMusic(): void {
    if (!this.musicActive || !this.musicPaused || !this.normalAudio || !this.underscoreAudio) return;
    this.musicPaused = false;
    this.syncTracks(true);
    this.applyMusicVolumes();
    this.normalAudio.play().catch(() => {});
    this.underscoreAudio.play().catch(() => {});
    this.startMusicLoop();
  }

  stopMusic(): void {
    this.musicActive = false;
    this.musicPaused = false;
    this.stopMusicLoop();
    for (const audio of [this.normalAudio, this.underscoreAudio]) {
      if (!audio) continue;
      audio.pause();
      try {
        audio.currentTime = 0;
      } catch {
        // Bỏ qua nếu chưa sẵn sàng
      }
    }
  }

  loadMutedState(): boolean {
    try {
      return localStorage.getItem(GAME_CONFIG.SOUND_MUTED_KEY) === "1";
    } catch {
      return false;
    }
  }

  saveMutedState(): void {
    try {
      localStorage.setItem(GAME_CONFIG.SOUND_MUTED_KEY, this.muted ? "1" : "0");
    } catch {
      // Bỏ qua nếu trình duyệt chặn localStorage
    }
  }

  ensureContext(): AudioContext | null {
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.saveMutedState();
    this.applyMusicVolumes();
    if (!this.muted) {
      this.ensureContext();
      if (this.musicActive && !this.musicPaused && this.normalAudio && this.underscoreAudio) {
        this.syncTracks(true);
        if (this.normalAudio.paused) this.normalAudio.play().catch(() => {});
        if (this.underscoreAudio.paused) this.underscoreAudio.play().catch(() => {});
        this.startMusicLoop();
      }
    }
    return this.muted;
  }

  playTone(
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    durationSec: number,
    volume = 0.08,
    delaySec = 0
  ): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime + delaySec;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, startFreq), now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + durationSec);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume * this.masterVolume), now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationSec + 0.01);
    } catch {
      // Bỏ qua lỗi audio nếu trình duyệt chưa cho phát
    }
  }

  // Hiệu ứng âm thanh UI kiểu Sci-Fi Arcade
  playUIHover(): void {
    this.playTone("sine", 920, 1180, 0.035, 0.025);
  }

  playUIClick(): void {
    this.playTone("triangle", 640, 960, 0.055, 0.05);
  }

  playUIBack(): void {
    this.playTone("triangle", 540, 340, 0.06, 0.045);
  }

  playShoot(weaponLevel = 1): void {
    if (weaponLevel >= 3) {
      this.playTone("triangle", 880, 260, 0.08, 0.07);
    } else if (weaponLevel === 2) {
      this.playTone("triangle", 760, 240, 0.075, 0.065);
    } else {
      this.playTone("square", 660, 220, 0.065, 0.05);
    }
  }

  playHit(): void {
    this.playTone("triangle", 320, 140, 0.05, 0.06);
  }

  playExplosion(isBig = false): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const duration = isBig ? 0.48 : 0.18;
    const volume = (isBig ? 0.16 : 0.1) * this.masterVolume;
    if (volume <= 0.001) return;

    try {
      const sampleRate = ctx.sampleRate;
      const frameCount = Math.floor(sampleRate * duration);
      const buffer = ctx.createBuffer(1, frameCount, sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frameCount; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / frameCount);
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(isBig ? 900 : 1200, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + duration);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();

      this.playTone("sawtooth", isBig ? 140 : 180, 40, duration, volume * 0.65);
    } catch {
      // Bỏ qua nếu context chưa sẵn sàng
    }
  }

  playPowerUp(type: PowerUpType): void {
    if (type === "weapon") {
      this.playTone("sine", 523, 659, 0.08, 0.09, 0);
      this.playTone("sine", 659, 880, 0.1, 0.09, 0.07);
      this.playTone("sine", 880, 1175, 0.12, 0.09, 0.14);
    } else if (type === "shield") {
      this.playTone("triangle", 440, 660, 0.1, 0.08, 0);
      this.playTone("triangle", 660, 990, 0.14, 0.08, 0.08);
    } else {
      this.playTone("sine", 494, 740, 0.09, 0.09, 0);
      this.playTone("sine", 740, 988, 0.13, 0.09, 0.08);
    }
  }

  playPlayerHit(): void {
    this.playTone("sawtooth", 210, 70, 0.22, 0.12);
  }

  playBossWarning(): void {
    this.playTone("sawtooth", 340, 240, 0.22, 0.11, 0);
    this.playTone("sawtooth", 340, 220, 0.28, 0.11, 0.28);
  }

  playGameOver(): void {
    this.playTone("triangle", 440, 392, 0.16, 0.1, 0);
    this.playTone("triangle", 349, 294, 0.18, 0.1, 0.18);
    this.playTone("triangle", 262, 165, 0.34, 0.11, 0.38);
  }
}
