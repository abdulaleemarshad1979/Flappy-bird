import Phaser from 'phaser';
import { GROUND_H, GROUND_Y, H, PIPE_H, PIPE_W, W } from './GameConfig';

/** All art is generated here as pixel-art canvases, so the game ships with zero image files. */
const INK = '#543847';

function mk(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  return [c, x];
}

function rng(seed: number): () => number {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ------------------------------------------------------------------ logo
// Custom 8-bit lettering: chunky 2-cell strokes, drawn cell by cell.
const GLYPHS: Record<string, { top: number; rows: string[] }> = {
  A: { top: 0, rows: ['..######..', '.########.', '##......##', '##......##', '##......##', '##########', '##########', '##......##', '##......##', '##......##', '##......##'] },
  u: { top: 3, rows: ['##....##', '##....##', '##....##', '##....##', '##....##', '###...##', '.#######', '..######'] },
  t: { top: 1, rows: ['.##...', '.##...', '######', '######', '.##...', '.##...', '.##...', '.##...', '.###..', '..####'] },
  h: { top: 0, rows: ['##......', '##......', '##......', '##.####.', '########', '###..###', '##....##', '##....##', '##....##', '##....##', '##....##'] },
  B: { top: 0, rows: ['########.', '#########', '##.....##', '##.....##', '##.....##', '########.', '#########', '##.....##', '##.....##', '#########', '########.'] },
  i: { top: 0, rows: ['##', '##', '..', '##', '##', '##', '##', '##', '##', '##', '##'] },
  r: { top: 3, rows: ['##.####', '#######', '###....', '##.....', '##.....', '##.....', '##.....', '##.....'] },
  d: { top: 0, rows: ['......##', '......##', '......##', '.####.##', '########', '###..###', '##....##', '##....##', '###..###', '########', '.####.##'] },
};

export function createLogo(text: string, cell = 3): HTMLCanvasElement {
  const cap = 11, pad = 2, gap = 1, space = 4;
  let width = 0;
  for (const ch of text) width += (ch === ' ' ? space : GLYPHS[ch].rows[0].length + gap);
  width -= gap;
  const gw = width + pad * 2, gh = cap + pad * 2;
  const fill: boolean[][] = Array.from({ length: gh }, () => Array<boolean>(gw).fill(false));
  let x = pad;
  for (const ch of text) {
    if (ch === ' ') {
      x += space;
      continue;
    }
    const g = GLYPHS[ch];
    g.rows.forEach((row, r) => [...row].forEach((c, i) => c === '#' && (fill[pad + g.top + r][x + i] = true)));
    x += g.rows[0].length + gap;
  }
  const near = (grid: boolean[][], px: number, py: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (grid[py + dy]?.[px + dx]) return true;
    return false;
  };
  const [c, ctx] = mk(gw * cell, (gh + 1) * cell);
  const rect = (px: number, py: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(px * cell, py * cell, cell, cell);
  };
  for (let py = 0; py < gh; py++)
    for (let px = 0; px < gw; px++) {
      if (near(fill, px, py - 1)) rect(px, py + 1, '#2e1c26'); // drop shadow (outline shifted down)
    }
  for (let py = 0; py < gh; py++)
    for (let px = 0; px < gw; px++) {
      if (near(fill, px, py)) rect(px, py, INK);
    }
  for (let py = 0; py < gh; py++)
    for (let px = 0; px < gw; px++) {
      if (fill[py][px]) rect(px, py, fill[py + 1]?.[px] ? '#ffffff' : '#e3ddc8'); // cream shade on bottom edges
    }
  return c;
}

// ------------------------------------------------------------------ bird
const BIRD_PX = 2;
const BW = 19, BH = 14;

const BIRD_MAP = [
  '....KKKKKKKK.......',
  '..KKYYYYYYYKKKKK...',
  '.KYYYYYYYYYKWWWWKK.',
  'KYYYYYYYYYKWWWWKKKK',
  'KYYYYYYYYYKWWWWKKKK',
  'KYYYYYYYYYKWWWWKKKK',
  'KYYYYYYYYYYKKKKKKK.',
  'KYYYYYYYYYYKRRRRRRK',
  'KYYYYYYYYYYKKKKKKKK',
  'KYYYYYYYYYYKDDDDDDK',
  '.KOOOOOOOOOKKKKKKK.',
  '.KOOOOOOOOK.......',
  '..KKOOOOOOKK.......',
  '....KKKKKKK........',
].map((r) => r.padEnd(19, '.'));
const BIRD_COLORS: Record<string, string> = { K: INK, Y: '#f8c82f', O: '#f08a1c', W: '#ffffff', R: '#f2561d', D: '#c7340f' };

export function birdFrame(wing: 0 | 1 | 2): HTMLCanvasElement {
  const grid: (string | null)[][] = BIRD_MAP.map((r) => [...r].map((ch) => BIRD_COLORS[ch] ?? null));
  const ellipse = (cx: number, cy: number, rx: number, ry: number, col: (y: number) => string) => {
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) grid[y][x] = col(y);
  };
  const wy = [4.6, 6.6, 8.4][wing]; // flapping wing: up / mid / down
  ellipse(5, wy + 0.6, 4.6, 2.9, () => INK);
  ellipse(5, wy + 0.6, 3.7, 2.1, (y) => (y > wy + 1 ? '#e3ddc8' : '#ffffff'));
  const [c, ctx] = mk(BW * BIRD_PX, BH * BIRD_PX);
  for (let y = 0; y < BH; y++)
    for (let x = 0; x < BW; x++) {
      const col = grid[y][x];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(x * BIRD_PX, y * BIRD_PX, BIRD_PX, BIRD_PX);
      }
    }
  return c;
}

// ------------------------------------------------------------------ pipes / ground
function pipeColor(t: number): string {
  if (t < 0.08) return '#dff59a';
  if (t < 0.2) return '#b4ea55';
  if (t < 0.62) return '#7ad23a';
  if (t < 0.82) return '#6ab82c';
  return '#4f8a1f';
}

function makePipe(): HTMLCanvasElement {
  const [c, ctx] = mk(PIPE_W, PIPE_H);
  const capH = 24, bodyX0 = 4, bodyX1 = PIPE_W - 4;
  // body
  for (let x = bodyX0; x < bodyX1; x++) {
    const edge = x < bodyX0 + 2 || x >= bodyX1 - 2;
    ctx.fillStyle = edge ? INK : pipeColor((x - bodyX0 - 2) / (bodyX1 - bodyX0 - 4));
    ctx.fillRect(x, capH, 1, PIPE_H - capH);
  }
  // shadow under cap
  ctx.fillStyle = 'rgba(40,70,10,0.45)';
  ctx.fillRect(bodyX0 + 2, capH, bodyX1 - bodyX0 - 4, 6);
  // cap
  for (let x = 0; x < PIPE_W; x++) {
    const edge = x < 2 || x >= PIPE_W - 2;
    ctx.fillStyle = edge ? INK : pipeColor((x - 2) / (PIPE_W - 4));
    ctx.fillRect(x, 0, 1, capH);
  }
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, PIPE_W, 2);
  ctx.fillRect(0, capH - 2, PIPE_W, 2);
  return c;
}

function makeGround(): HTMLCanvasElement {
  const w = 32;
  const [c, ctx] = mk(w, GROUND_H);
  ctx.fillStyle = '#ded895';
  ctx.fillRect(0, 0, w, GROUND_H);
  ctx.fillStyle = '#cfc785';
  ctx.fillRect(0, 16, w, 2);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, 2);
  for (let y = 2; y < 14; y++)
    for (let x = 0; x < w; x++) {
      ctx.fillStyle = (x + y) % 16 < 8 ? '#73bf2e' : '#9be655';
      ctx.fillRect(x, y, 1, 1);
    }
  ctx.fillStyle = '#e9f5a2';
  ctx.fillRect(0, 2, w, 2);
  ctx.fillStyle = '#558022';
  ctx.fillRect(0, 14, w, 2);
  return c;
}

// ------------------------------------------------------------------ scenery
function makeSky(id: string): HTMLCanvasElement {
  const [c, ctx] = mk(W, H);
  const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const band = (stops: number[][], pos: number[]) => {
    for (let y = 0; y < H; y += 8) {
      const t = y / H;
      let i = 0;
      while (i < pos.length - 2 && t > pos[i + 1]) i++;
      const k = Math.min(1, Math.max(0, (t - pos[i]) / (pos[i + 1] - pos[i])));
      ctx.fillStyle = `rgb(${lerp(stops[i], stops[i + 1], k).join(',')})`;
      ctx.fillRect(0, y, W, 8);
    }
  };
  const r = rng(7);
  if (id === 'turquoise') {
    ctx.fillStyle = '#4ec0ca';
    ctx.fillRect(0, 0, W, H);
  } else if (id === 'day') {
    band([[42, 143, 216], [168, 228, 255]], [0, 1]);
  } else if (id === 'sunset') {
    band([[43, 31, 92], [194, 67, 122], [255, 164, 94]], [0, 0.55, 0.9]);
    ctx.fillStyle = '#ffe28a';
    for (let y = -34; y <= 34; y += 2) {
      const half = Math.floor(Math.sqrt(34 * 34 - y * y));
      ctx.fillRect(196 - half, GROUND_Y - 56 + y, half * 2, 2);
    }
  } else {
    band([[7, 13, 38], [30, 47, 104]], [0, 0.9]);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = r() > 0.7 ? '#ffffff' : '#9fb0e8';
      ctx.fillRect(Math.floor(r() * W) & ~1, Math.floor(r() * (GROUND_Y - 76)) & ~1, 2, 2);
    }
    ctx.fillStyle = '#fff4c2';
    for (let y = -16; y <= 16; y += 2) {
      const half = Math.floor(Math.sqrt(16 * 16 - y * y));
      ctx.fillRect(232 - half, 90 + y, half * 2, 2);
    }
    ctx.fillStyle = '#1b2a60'; // crescent cut
    for (let y = -14; y <= 14; y += 2) {
      const half = Math.floor(Math.sqrt(13 * 13 - y * y));
      ctx.fillRect(238 - half, 86 + y, half * 2, 2);
    }
  }
  return c;
}

function makeCity(): HTMLCanvasElement {
  const [c, ctx] = mk(W, 72);
  const r = rng(11);
  let x = 0;
  while (x < W) {
    const w = Math.min(W - x, 14 + Math.floor(r() * 5) * 4);
    const h = 24 + Math.floor(r() * 12) * 4;
    ctx.fillStyle = 'rgba(190,240,232,0.55)';
    ctx.fillRect(x, 72 - h, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let wy = 72 - h + 4; wy < 68; wy += 8) for (let wx = x + 3; wx < x + w - 3; wx += 6) ctx.fillRect(wx, wy, 2, 3);
    x += w + (r() > 0.6 ? 2 : 0);
    if (x > W) break;
  }
  return c;
}

function makeScallop(h: number, period: number, amp: number, top: string, body: string, shade: string): HTMLCanvasElement {
  const [c, ctx] = mk(W, h);
  for (let x = 0; x < W; x += 3) {
    const k = Math.abs(Math.sin(((x + 1.5) / period) * Math.PI)); // seamless: W is a multiple of period
    const top_y = h - Math.round((h - amp + amp * k) / 3) * 3;
    ctx.fillStyle = body;
    ctx.fillRect(x, top_y, 3, h - top_y);
    ctx.fillStyle = top;
    ctx.fillRect(x, top_y, 3, 3);
    ctx.fillStyle = shade;
    ctx.fillRect(x, h - 6, 3, 6);
  }
  return c;
}

function makeCloud(): HTMLCanvasElement {
  const [c, ctx] = mk(64, 28);
  const blobs: [number, number, number][] = [[16, 18, 9], [30, 12, 12], [46, 17, 10], [24, 19, 8], [40, 20, 8]];
  for (const [bx, by, br] of blobs)
    for (let y = 0; y < 28; y += 2)
      for (let x = 0; x < 64; x += 2) if ((x - bx) ** 2 + (y - by) ** 2 <= br * br) {
        ctx.fillStyle = y > 20 ? '#dff0ee' : '#ffffff';
        ctx.fillRect(x, y, 2, 2);
      }
  return c;
}

export function generateTextures(scene: Phaser.Scene): void {
  const t = scene.textures;
  const add = (key: string, canvas: HTMLCanvasElement) => {
    if (!t.exists(key)) t.addCanvas(key, canvas);
  };
  const [bx, bctx] = mk(BW * BIRD_PX * 3, BH * BIRD_PX);
  ([0, 1, 2] as const).forEach((i) => bctx.drawImage(birdFrame(i), i * BW * BIRD_PX, 0));
  if (!t.exists('bird')) {
    const tex = t.addCanvas('bird', bx)!;
    for (let i = 0; i < 3; i++) tex.add(i, 0, i * BW * BIRD_PX, 0, BW * BIRD_PX, BH * BIRD_PX);
  }
  add('pipe', makePipe());
  add('ground', makeGround());
  add('city', makeCity());
  add('cloudband', makeScallop(30, 48, 18, '#ffffff', '#ecfbe4', '#cdeec4'));
  add('bushes', makeScallop(27, 36, 15, '#9be655', '#5fd05a', '#44a84a'));
  add('cloud', makeCloud());
  for (const id of ['turquoise', 'day', 'sunset', 'night']) add(`sky-${id}`, makeSky(id));
  const [px, pctx] = mk(4, 4);
  pctx.fillStyle = '#fff';
  pctx.fillRect(0, 0, 4, 4);
  add('px', px);
  add('logo', createLogo('Authu Bird', 3));
}
