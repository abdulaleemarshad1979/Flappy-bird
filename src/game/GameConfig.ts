export const W = 288;
/** Logical height follows the screen shape (tall phones get a taller world) between 9:16 and 9:20. Computed once at load. */
const ratio = typeof window === 'undefined' ? 16 / 9 : window.innerHeight / window.innerWidth;
export const H = Math.round(Math.min(640, Math.max(512, W * ratio)) / 2) * 2;
export const GROUND_H = 56;
export const GROUND_Y = H - GROUND_H;
export const BIRD_X = 84;
export const HIT_R = 12; // same hit circle for every character image -> fair
export const PIPE_W = 52;
export const PIPE_H = 320;

export type Difficulty = 'easy' | 'normal' | 'hard';

/** px and px/s in the 288x512 logical space. Normal ~ classic Flappy Bird feel. */
export const DIFFICULTY: Record<Difficulty, { gravity: number; flap: number; speed: number; gap: number; spacing: number }> = {
  easy: { gravity: 900, flap: -310, speed: 100, gap: 132, spacing: 190 },
  normal: { gravity: 1100, flap: -340, speed: 130, gap: 110, spacing: 170 },
  hard: { gravity: 1300, flap: -370, speed: 165, gap: 94, spacing: 150 },
};

export type ThemeId = 'turquoise' | 'day' | 'sunset' | 'night' | 'custom';

export interface Theme {
  label: string;
  preview: string; // CSS background for the swatch
  tint: number; // multiplied onto city/cloud/bush/ground/pipe layers
}

export const THEMES: Record<ThemeId, Theme> = {
  turquoise: { label: 'TURQUOISE', preview: '#4ec0ca', tint: 0xffffff },
  day: { label: 'DAY SKY', preview: 'linear-gradient(#2a8fd8,#a8e4ff)', tint: 0xffffff },
  sunset: { label: 'SUNSET', preview: 'linear-gradient(#2b1f5c,#c2437a,#ffa45e)', tint: 0xffc8a0 },
  night: { label: 'NIGHT', preview: 'linear-gradient(#070d26,#1e2f68)', tint: 0x6a78b0 },
  custom: { label: 'CUSTOM', preview: '#888', tint: 0xffffff },
};
