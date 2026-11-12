import { bus } from '../bus';
import { validateFile, type SaveResult } from './AssetManager';
import { settings } from './SettingsManager';
import { storage } from './StorageManager';

type SfxKind = 'crash';
type MusicState = 'stopped' | 'playing' | 'paused';

interface Track {
  id: 'sky' | 'night';
  name: string;
  bpm: number;
  melody: number[]; // MIDI notes, 0 = rest, one per eighth note
  bass: number[];
}

// Original chiptune loops, synthesized live (no audio files shipped).
export const TRACKS: Track[] = [
  {
    id: 'sky',
    name: 'SKY HOP',
    bpm: 140,
    melody: [72, 0, 76, 0, 79, 0, 76, 0, 74, 0, 77, 0, 81, 0, 77, 0, 72, 0, 76, 0, 79, 0, 84, 0, 83, 0, 79, 0, 76, 0, 0, 0],
    bass: [48, 0, 55, 0, 48, 0, 55, 0, 50, 0, 57, 0, 50, 0, 57, 0, 48, 0, 55, 0, 48, 0, 55, 0, 43, 0, 50, 0, 43, 0, 50, 0],
  },
  {
    id: 'night',
    name: 'NIGHT RUN',
    bpm: 112,
    melody: [69, 0, 72, 0, 76, 0, 72, 0, 71, 0, 74, 0, 77, 0, 74, 0, 69, 0, 72, 0, 76, 0, 81, 0, 80, 0, 76, 0, 72, 0, 0, 0],
    bass: [45, 0, 52, 0, 45, 0, 52, 0, 47, 0, 54, 0, 47, 0, 54, 0, 45, 0, 52, 0, 45, 0, 52, 0, 40, 0, 47, 0, 40, 0, 47, 0],
  },
];

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

class AudioManager {
  private ctx: AudioContext | null = null;
  private fade!: GainNode; // music fade in/out
  private musicGain!: GainNode; // music volume / mute
  private sfxGain!: GainNode;

  private state: MusicState = 'stopped';
  private wanted = false; // music requested before the browser allowed audio
  private token = 0; // invalidates pending fade-out timeouts

  // custom music (HTMLAudioElement routed through WebAudio)
  private media: { el: HTMLAudioElement; url: string; node?: MediaElementAudioSourceNode } | null = null;
  // procedural music
  private timer = 0;
  private endTimer = 0;
  private step = 0;
  private nextTime = 0;

  private blobs: Partial<Record<SfxKind, Blob>> = {};
  private buffers: Partial<Record<SfxKind, AudioBuffer>> = {};
  private active: Partial<Record<SfxKind, { stop: () => void }>> = {};
  private previewingMusic = false;

  /** Load saved custom audio and register the autoplay-unlock listeners. */
  async init(): Promise<void> {
    const unlock = () => this.unlock();
    for (const ev of ['pointerdown', 'touchend', 'keydown'] as const) window.addEventListener(ev, unlock, { passive: true });
    bus.on('settings', () => this.applySettings());

    for (const kind of ['music', 'crash'] as const) {
      if (!settings.s.customs[kind]) continue;
      const blob = await storage.getAsset(kind);
      if (!blob) {
        settings.update((s) => (s.customs[kind] = null));
        setTimeout(() => bus.emit('toast', `Saved custom ${kind} audio was not found. Using default.`), 800);
      } else if (kind === 'music') this.setMusicBlob(blob);
      else this.blobs[kind] = blob;
    }
  }

  // ---------------------------------------------------------------- context
  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.musicGain = ctx.createGain();
    this.fade = ctx.createGain();
    this.sfxGain = ctx.createGain();
    this.fade.connect(this.musicGain).connect(ctx.destination);
    this.sfxGain.connect(ctx.destination);
    this.applySettings();
    return ctx;
  }

  /** Must be called from a user gesture (done by the global listeners). */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') {
      void ctx.resume().then(() => {
        if (this.wanted && this.state === 'stopped') this.musicPlay(true);
        void this.predecode();
      });
    } else void this.predecode();
  }

  private applySettings(): void {
    const a = settings.s.audio;
    if (this.ctx) {
      this.musicGain.gain.value = a.musicEnabled && !a.musicMuted ? a.musicVolume : 0;
      this.sfxGain.gain.value = a.sfxEnabled && !a.sfxMuted ? a.sfxVolume : 0;
    }
    if (this.media) this.media.el.loop = a.loop;
    if (!a.musicEnabled && this.state !== 'stopped') this.musicStop(0);
  }

  private async predecode(): Promise<void> {
    await this.decodeSfx('crash');
  }

  private async decodeSfx(kind: SfxKind): Promise<boolean> {
    if (this.buffers[kind]) return true;
    const blob = this.blobs[kind];
    if (!blob) return false;
    try {
      this.buffers[kind] = await this.ensure().decodeAudioData(await blob.arrayBuffer());
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- music
  isMusicPlaying(): boolean {
    return this.state === 'playing';
  }

  private setState(s: MusicState): void {
    this.state = s;
    bus.emit('music-state', s);
  }

  /** Start (or resume when paused and restart=false) the configured music. */
  musicPlay(restart = false): void {
    if (!settings.s.audio.musicEnabled) return;
    this.wanted = true;
    const ctx = this.ensure();
    if (ctx.state !== 'running') {
      void ctx.resume();
      return; // unlock() will retry once the browser allows audio
    }
    this.token++;
    if (this.state === 'playing' && !restart) return;
    const resuming = this.state === 'paused' && !restart;
    if (!resuming) this.killMusicNodes();
    this.fade.gain.cancelScheduledValues(ctx.currentTime);
    this.fade.gain.setValueAtTime(1, ctx.currentTime);

    if (this.media) {
      const { el } = this.media;
      this.media.node ??= ctx.createMediaElementSource(el);
      this.media.node.connect(this.fade);
      el.loop = settings.s.audio.loop;
      if (!resuming) el.currentTime = 0;
      void el.play().catch(() => this.setState('stopped'));
    } else {
      if (!resuming) this.step = 0;
      this.nextTime = ctx.currentTime + 0.06;
      this.timer = window.setInterval(() => this.schedule(), 40);
    }
    this.setState('playing');
  }

  musicPause(): void {
    if (this.state !== 'playing') return;
    this.halt();
    this.setState('paused');
  }

  /** Fade out (default) and stop. Safe to call repeatedly. */
  musicStop(fadeMs = 0): void {
    this.wanted = false;
    this.previewingMusic = false;
    if (this.state === 'stopped') return;
    const my = ++this.token;
    this.setState('stopped');
    if (!this.ctx || fadeMs <= 0) {
      this.killMusicNodes();
      return;
    }
    const t = this.ctx.currentTime;
    this.fade.gain.cancelScheduledValues(t);
    this.fade.gain.setValueAtTime(this.fade.gain.value, t);
    this.fade.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
    window.setTimeout(() => {
      if (this.token === my) this.killMusicNodes(); // a newer musicPlay cancels the cleanup
    }, fadeMs + 30);
  }

  /** Stop scheduling / playing without losing position. */
  private halt(): void {
    window.clearInterval(this.timer);
    window.clearTimeout(this.endTimer);
    this.media?.el.pause();
  }

  private killMusicNodes(): void {
    this.halt();
    if (this.media) {
      this.media.el.currentTime = 0;
      try {
        this.media.node?.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }

  previewMusic(): void {
    if (this.state === 'playing' && this.previewingMusic) this.musicStop(0);
    else {
      this.musicPlay(true);
      this.previewingMusic = true;
    }
  }

  stopPreview(): void {
    if (this.previewingMusic) this.musicStop(0);
  }

  // procedural sequencer (look-ahead scheduling)
  private schedule(): void {
    const ctx = this.ctx!;
    const tr = TRACKS.find((t) => t.id === settings.s.audio.track) ?? TRACKS[0];
    const dur = 60 / tr.bpm / 2;
    while (this.nextTime < ctx.currentTime + 0.15) {
      const m = tr.melody[this.step], b = tr.bass[this.step];
      if (m) this.tone(midi(m), this.nextTime, dur * 0.85, 'square', 0.11, this.fade);
      if (b) this.tone(midi(b), this.nextTime, dur * 1.7, 'triangle', 0.2, this.fade);
      this.nextTime += dur;
      if (++this.step >= tr.melody.length) {
        this.step = 0;
        if (!settings.s.audio.loop) {
          window.clearInterval(this.timer);
          this.endTimer = window.setTimeout(() => {
            this.previewingMusic = false;
            this.setState('stopped');
          }, Math.max(0, (this.nextTime - ctx.currentTime) * 1000) + 80);
          return;
        }
      }
    }
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, dest: AudioNode, slideTo?: number): OscillatorNode {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // ---------------------------------------------------------------- sfx
  stopSfx(kind: SfxKind): void {
    this.active[kind]?.stop();
    delete this.active[kind];
  }

  stopCrash(): void {
    this.stopSfx('crash');
  }

  /** Plays the active crash sound exactly once; any earlier instance is stopped first. */
  playCrash(): void {
    this.playSfx('crash');
  }

  private playSfx(kind: SfxKind): void {
    if (!settings.s.audio.sfxEnabled) return;
    const ctx = this.ensure();
    if (ctx.state !== 'running') void ctx.resume();
    this.stopSfx(kind);
    const buf = this.buffers[kind];
    if (buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.sfxGain);
      src.onended = () => {
        if (this.active[kind]?.stop === stop) delete this.active[kind];
      };
      const stop = () => {
        src.onended = null;
        try {
          src.stop();
        } catch {
          /* not started */
        }
        src.disconnect();
      };
      src.start();
      this.active[kind] = { stop };
      return;
    }
    if (this.blobs[kind]) void this.decodeSfx(kind); // decode for next time, play nothing odd meanwhile
    const t = ctx.currentTime;
    const nodes = [this.tone(330, t, 0.28, 'square', 0.3, this.sfxGain, 70), this.tone(180, t + 0.22, 0.4, 'sawtooth', 0.25, this.sfxGain, 45)];
    this.active[kind] = { stop: () => nodes.forEach((n) => { try { n.stop(); } catch { /* ended */ } }) };
  }

  /** Score ding (always the built-in blip). */
  playPoint(): void {
    if (!settings.s.audio.sfxEnabled) return;
    const ctx = this.ensure();
    if (ctx.state !== 'running') return;
    this.tone(988, ctx.currentTime, 0.08, 'square', 0.12, this.sfxGain);
    this.tone(1319, ctx.currentTime + 0.07, 0.16, 'square', 0.12, this.sfxGain);
  }

  // ---------------------------------------------------------------- uploads
  private setMusicBlob(blob: Blob): void {
    this.dropMusic();
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    el.preload = 'auto';
    el.loop = settings.s.audio.loop;
    el.addEventListener('ended', () => {
      this.previewingMusic = false;
      if (this.state === 'playing') this.setState('stopped');
    });
    this.media = { el, url };
  }

  private dropMusic(): void {
    if (!this.media) return;
    this.musicStop(0);
    this.media.el.pause();
    try {
      this.media.node?.disconnect();
    } catch {
      /* ignore */
    }
    URL.revokeObjectURL(this.media.url);
    this.media = null;
  }

  async setCustom(kind: 'music' | SfxKind, file: File): Promise<SaveResult> {
    const err = validateFile(file, 'audio');
    if (err) return { ok: false, error: err, persisted: false };
    this.ensure();
    if (kind === 'music') {
      const probe = new Audio(URL.createObjectURL(file));
      const ok = await new Promise<boolean>((res) => {
        probe.addEventListener('loadedmetadata', () => res(Number.isFinite(probe.duration) && probe.duration > 0), { once: true });
        probe.addEventListener('error', () => res(false), { once: true });
        window.setTimeout(() => res(false), 6000);
      });
      URL.revokeObjectURL(probe.src);
      if (!ok) return { ok: false, error: 'Could not play that audio file.', persisted: false };
      this.setMusicBlob(file);
    } else {
      try {
        const buf = await this.ctx!.decodeAudioData(await file.arrayBuffer());
        this.buffers[kind] = buf;
        this.blobs[kind] = file;
      } catch {
        return { ok: false, error: 'Could not decode that audio file.', persisted: false };
      }
    }
    const persisted = await storage.putAsset(kind, file);
    settings.update((s) => (s.customs[kind] = file.name));
    return { ok: true, persisted };
  }

  async resetCustom(kind: 'music' | SfxKind): Promise<void> {
    if (kind === 'music') this.dropMusic();
    else {
      this.stopSfx(kind);
      delete this.blobs[kind];
      delete this.buffers[kind];
    }
    await storage.deleteAsset(kind);
    settings.update((s) => (s.customs[kind] = null));
  }

  async resetAll(): Promise<void> {
    for (const k of ['music', 'crash'] as const) {
      if (k === 'music') this.dropMusic();
      else {
        this.stopSfx(k);
        delete this.blobs[k];
        delete this.buffers[k];
      }
      await storage.deleteAsset(k);
    }
  }

  preview(kind: SfxKind): void {
    this.unlock();
    this.playSfx(kind);
  }
}

export const audio = new AudioManager();
