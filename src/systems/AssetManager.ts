import Phaser from 'phaser';
import { bus } from '../bus';
import { H } from '../game/GameConfig';
import { settings, type Kind, type Settings } from './SettingsManager';
import { storage } from './StorageManager';

export const CHAR_OUT = 56; // output sprite size (px)
export const BG_W = 288 * 2; // custom background texture: image + mirrored image => seamless scroll
export const BG_H = H;

const MAX_IMAGE = 12 * 1024 * 1024;
const MAX_AUDIO = 25 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AUDIO_EXT = /\.(mp3|wav|ogg|oga)$/i;

/** Returns an error message or null. */
export function validateFile(file: File, type: 'image' | 'audio'): string | null {
  if (type === 'image') {
    if (!IMAGE_TYPES.includes(file.type)) return 'Use a JPG, PNG or WebP image.';
    if (file.size > MAX_IMAGE) return 'Image is too big (max 12 MB).';
  } else {
    if (!(file.type.startsWith('audio/') || file.type === 'application/ogg') && !AUDIO_EXT.test(file.name)) return 'Use an MP3, WAV or OGG file.';
    if (!AUDIO_EXT.test(file.name) && !/mpeg|mp3|wav|ogg/.test(file.type)) return 'Use an MP3, WAV or OGG file.';
    if (/\.og[ga]$/i.test(file.name) || /ogg/.test(file.type)) {
      if (!document.createElement('audio').canPlayType('audio/ogg; codecs=vorbis')) return 'This browser cannot play OGG. Use MP3 or WAV.';
    }
    if (file.size > MAX_AUDIO) return 'Audio is too big (max 25 MB).';
  }
  return null;
}

function mkCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!];
}

type Src = CanvasImageSource & { width: number; height: number };

const trimCache = new WeakMap<object, Src>();

/** Crop away fully transparent margins so a cut-out face fills the sprite. Opaque photos are returned unchanged. */
function trimTransparent(src: Src): Src {
  const hit = trimCache.get(src);
  if (hit) return hit;
  const [c, x] = mkCanvas(src.width, src.height);
  x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++)
    for (let xx = 0; xx < c.width; xx++)
      if (d[(y * c.width + xx) * 4 + 3] >= 128) {
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  let out: Src = src;
  if (x1 >= 0 && (x0 > 0 || y0 > 0 || x1 < c.width - 1 || y1 < c.height - 1)) {
    const [t, tx] = mkCanvas(x1 - x0 + 1, y1 - y0 + 1);
    tx.drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
    out = t;
  }
  trimCache.set(src, out);
  return out;
}

/**
 * Turn any picture into a pixel-art-friendly character sprite:
 * fit (aspect kept) -> optional pixelate+quantize -> hard-edged mask -> outline -> shadow.
 */
export function renderCharacter(source: Src, o: Settings['character'], out: HTMLCanvasElement): void {
  const src = o.crop === 'original' ? trimTransparent(source) : source;
  const w = o.pixelate ? 24 : 48; // working resolution of the face area
  const m = o.pixelate ? 2 : 4; // margin for outline + shadow
  const size = w + 2 * m;
  const edge = o.pixelate ? 1 : 2; // outline thickness / shadow offset in working px
  const [work, ctx] = mkCanvas(size, size);

  // 1. draw fitted image (cover for masks, contain for original), clipped to the face area
  const sw = src.width, sh = src.height;
  const fit = o.crop === 'original' ? Math.min(w / sw, w / sh) : Math.max(w / sw, w / sh);
  const dw = sw * fit * o.zoom, dh = sh * fit * o.zoom;
  ctx.save();
  ctx.beginPath();
  ctx.rect(m, m, w, w);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, m + (w - dw) / 2 + (o.x * w) / 2, m + (w - dh) / 2 + (o.y * w) / 2, dw, dh);
  ctx.restore();

  // 2. per-pixel: hard alpha, mask, quantize
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const c = size / 2;
  const half = w / 2;
  const rad = w * 0.24;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let inside = d[i + 3] >= 128; // transparent edge masking (no semi-transparent halos)
      if (inside && o.crop === 'circle') inside = Math.hypot(x + 0.5 - c, y + 0.5 - c) <= half;
      if (inside && o.crop === 'rounded') {
        const qx = Math.abs(x + 0.5 - c) - (half - rad), qy = Math.abs(y + 0.5 - c) - (half - rad);
        inside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) <= rad;
      }
      if (!inside) {
        d[i + 3] = 0;
        continue;
      }
      d[i + 3] = 255;
      if (o.pixelate) for (let k = 0; k < 3; k++) d[i + k] = Math.round((d[i + k] / 255) * 5) * 51; // 6 levels
    }
  }

  // 3. outline: transparent pixels near an opaque one
  if (o.outline) {
    const a = new Uint8Array(size * size);
    for (let p = 0; p < a.length; p++) a[p] = d[p * 4 + 3];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        if (a[y * size + x]) continue;
        let near = false;
        for (let dy = -edge; dy <= edge && !near; dy++)
          for (let dx = -edge; dx <= edge; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && ny >= 0 && nx < size && ny < size && a[ny * size + nx]) {
              near = true;
              break;
            }
          }
        if (near) {
          const i = (y * size + x) * 4;
          d[i] = 0x54; d[i + 1] = 0x38; d[i + 2] = 0x47; d[i + 3] = 255;
        }
      }
  }
  ctx.putImageData(img, 0, 0);

  // 4. subtle shadow, then scale to the fixed output size with nearest-neighbour
  const [fin, fctx] = mkCanvas(size, size);
  const [sh2, sctx] = mkCanvas(size, size);
  sctx.drawImage(work, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, size, size);
  if (o.shadow) {
    fctx.globalAlpha = 0.28;
    fctx.drawImage(sh2, 0, edge);
    fctx.globalAlpha = 1;
  }
  fctx.drawImage(work, 0, 0);

  const octx = out.getContext('2d')!;
  out.width = out.height = CHAR_OUT;
  octx.imageSmoothingEnabled = false;
  octx.clearRect(0, 0, CHAR_OUT, CHAR_OUT);
  octx.drawImage(fin, 0, 0, CHAR_OUT, CHAR_OUT);
}

/** Cover-fit the picture into one 288x512 tile and mirror it next to itself (seamless horizontal loop). */
export function renderBackground(src: Src, out: HTMLCanvasElement): void {
  const ctx = out.getContext('2d')!;
  out.width = BG_W;
  out.height = BG_H;
  const s = Math.max(288 / src.width, BG_H / src.height);
  const dw = src.width * s, dh = src.height * s;
  const dx = (288 - dw) / 2, dy = (BG_H - dh) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(src, dx, dy, dw, dh);
  ctx.save();
  ctx.translate(BG_W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, dx, dy, dw, dh);
  ctx.restore();
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(blob);
  const max = 1024; // keep memory small for huge photos
  if (Math.max(bmp.width, bmp.height) <= max) return bmp;
  const k = max / Math.max(bmp.width, bmp.height);
  const small = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: 'high' });
  bmp.close();
  return small;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
  persisted: boolean;
}

class AssetManager {
  charSource: ImageBitmap | null = null;
  bgSource: ImageBitmap | null = null;
  private charCanvas = Object.assign(document.createElement('canvas'), { width: CHAR_OUT, height: CHAR_OUT });
  private bgCanvas = Object.assign(document.createElement('canvas'), { width: BG_W, height: BG_H });
  private charTex?: Phaser.Textures.CanvasTexture;
  private bgTex?: Phaser.Textures.CanvasTexture;

  /** Load previously saved images (called before the game boots). */
  async init(): Promise<void> {
    for (const kind of ['character', 'background'] as const) {
      if (!settings.s.customs[kind]) continue;
      const blob = await storage.getAsset(kind);
      try {
        if (!blob) throw new Error('missing');
        const bmp = await decode(blob);
        if (kind === 'character') this.charSource = bmp;
        else this.bgSource = bmp;
      } catch {
        settings.update((s) => {
          s.customs[kind] = null;
          if (kind === 'background' && s.background.theme === 'custom') s.background.theme = 'turquoise';
        });
        setTimeout(() => bus.emit('toast', `Saved custom ${kind} was not found. Using default.`), 800);
      }
    }
  }

  /** Create the two persistent canvas textures (updated in place afterwards). */
  attach(textures: Phaser.Textures.TextureManager): void {
    this.charTex = textures.addCanvas('char-custom', this.charCanvas) ?? undefined;
    this.bgTex = textures.addCanvas('sky-custom', this.bgCanvas) ?? undefined;
    this.redrawCharacter();
    this.redrawBackground();
  }

  get hasCharacter(): boolean {
    return this.charSource !== null;
  }
  get hasBackground(): boolean {
    return this.bgSource !== null;
  }

  redrawCharacter(): void {
    if (this.charSource) renderCharacter(this.charSource, settings.s.character, this.charCanvas);
    else this.charCanvas.getContext('2d')!.clearRect(0, 0, CHAR_OUT, CHAR_OUT);
    this.charTex?.refresh();
    bus.emit('character');
  }

  redrawBackground(): void {
    if (this.bgSource) renderBackground(this.bgSource, this.bgCanvas);
    else this.bgCanvas.getContext('2d')!.clearRect(0, 0, BG_W, BG_H);
    this.bgTex?.refresh();
    bus.emit('background');
  }

  /** Decode a user file for preview without applying it. */
  async preview(file: File, type: 'image'): Promise<{ bmp?: ImageBitmap; error?: string }> {
    const err = validateFile(file, type);
    if (err) return { error: err };
    try {
      return { bmp: await decode(file) };
    } catch {
      return { error: 'Could not read that image.' };
    }
  }

  /** Apply an already-decoded image as the active character / background and persist the file. */
  async commit(kind: 'character' | 'background', file: File, bmp: ImageBitmap): Promise<SaveResult> {
    const persisted = await storage.putAsset(kind, file);
    if (kind === 'character') {
      this.charSource?.close();
      this.charSource = bmp;
      settings.update((s) => (s.customs.character = file.name));
      this.redrawCharacter();
    } else {
      this.bgSource?.close();
      this.bgSource = bmp;
      this.redrawBackground(); // draw before the settings event so the sky never snapshots a blank canvas
      settings.update((s) => {
        s.customs.background = file.name;
        s.background.theme = 'custom';
      });
    }
    return { ok: true, persisted };
  }

  async resetCharacter(): Promise<void> {
    this.charSource?.close();
    this.charSource = null;
    await storage.deleteAsset('character');
    settings.reset('character');
    this.redrawCharacter();
  }

  async resetBackground(): Promise<void> {
    this.bgSource?.close();
    this.bgSource = null;
    await storage.deleteAsset('background');
    settings.reset('background');
    this.redrawBackground();
  }

  isCustom(kind: Kind): boolean {
    return settings.s.customs[kind] !== null;
  }
}

export const assets = new AssetManager();
