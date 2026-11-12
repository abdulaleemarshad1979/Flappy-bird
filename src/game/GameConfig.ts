export const W = 288;
/** Logical height follows the screen shape (tall phones get a taller world) between 9:16 and 9:20. Computed once at load. */
const ratio = typeof window === 'undefined' ? 16 / 9 : window.innerHeight / window.innerWidth;
export const H = Math.round(Math.min(640, Math.max(512, W * ratio)) / 2) * 2;
export const GROUND_H = 56;

/** Render scale: the canvas is drawn K times larger than the logical 288xH world (nearest-neighbour pixel art stays crisp,
 *  photos get real detail). Chosen once from the on-screen stage size and device pixel ratio. */
const stageCss = typeof window === 'undefined' ? 600 : Math.min(window.innerWidth, window.innerHeight / (H / W));
export const K = Math.min(3, Math.max(2, Math.round((stageCss * (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)) / W)));
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
