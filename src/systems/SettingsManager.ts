import { bus } from '../bus';
import type { Difficulty, ThemeId } from '../game/GameConfig';
import { storage } from './StorageManager';

export type Kind = 'character' | 'music' | 'crash' | 'background';
export type Crop = 'circle' | 'rounded' | 'original';

export interface Settings {
  difficulty: Difficulty;
  character: { crop: Crop; zoom: number; x: number; y: number; pixelate: boolean; outline: boolean; shadow: boolean };
  audio: {
    musicVolume: number;
    sfxVolume: number;
    musicMuted: boolean;
    sfxMuted: boolean;
    musicEnabled: boolean;
    sfxEnabled: boolean;
    loop: boolean;
    track: 'sky' | 'night';
  };
  background: { theme: ThemeId; brightness: number; parallax: boolean };
  animations: { shake: boolean; particles: boolean; tilt: boolean };
  /** File name of the active uploaded asset per kind (the file itself lives in Cache Storage). */
  customs: Record<Kind, string | null>;
  version?: number;
}

export const DEFAULTS: Settings = {
  difficulty: 'normal',
  character: { crop: 'original', zoom: 1, x: 0, y: 0, pixelate: false, outline: false, shadow: false },
  audio: { musicVolume: 0.6, sfxVolume: 0.8, musicMuted: false, sfxMuted: false, musicEnabled: true, sfxEnabled: true, loop: true, track: 'sky' },
  background: { theme: 'turquoise', brightness: 1, parallax: true },
  animations: { shake: true, particles: true, tilt: true },
  customs: { character: null, music: null, crash: null, background: null },
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function load(): Settings {
  const stored = storage.getJSON<Partial<Settings>>('settings', {});
  const d = clone(DEFAULTS);
  return {
    version: 2,
    difficulty: stored.difficulty ?? d.difficulty,
    // v2 changed the character look defaults (image only, no crop/outline/shadow): drop older character looks once
    character: stored.version === 2 ? { ...d.character, ...stored.character } : d.character,
    audio: { ...d.audio, ...stored.audio },
    background: { ...d.background, ...stored.background },
    animations: { ...d.animations, ...stored.animations },
    customs: { ...d.customs, ...stored.customs },
  };
}

class SettingsManager {
  s: Settings = load();

  /** Mutate, persist, notify. */
  update(fn: (s: Settings) => void): void {
    fn(this.s);
    storage.setJSON('settings', this.s);
    bus.emit('settings');
  }

  /** Restore a section to defaults (customs are cleared by the caller that also deletes the files). */
  reset(section: 'character' | 'audio' | 'background' | 'gameplay' | 'all'): void {
    this.update((s) => {
      const d = clone(DEFAULTS);
      if (section === 'character' || section === 'all') {
        s.character = d.character;
        s.customs.character = null;
      }
      if (section === 'audio' || section === 'all') {
        s.audio = { ...d.audio, musicEnabled: s.audio.musicEnabled, sfxEnabled: s.audio.sfxEnabled };
        s.customs.music = s.customs.crash = null;
      }
      if (section === 'background' || section === 'all') {
        s.background = d.background;
        s.customs.background = null;
      }
      if (section === 'gameplay' || section === 'all') {
        s.difficulty = d.difficulty;
        s.animations = d.animations;
        s.audio.musicEnabled = d.audio.musicEnabled;
        s.audio.sfxEnabled = d.audio.sfxEnabled;
      }
    });
  }
}

export const settings = new SettingsManager();
