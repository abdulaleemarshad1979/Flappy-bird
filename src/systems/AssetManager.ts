import Phaser from 'phaser';
import { bus } from '../bus';
import { settings, type Kind, type Settings } from './SettingsManager';
import { storage } from './StorageManager';

export const CHAR_OUT = 224; // output sprite size (px); drawn in game at ~0.18 scale

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

/** Repeated halving keeps big photos sharp when shrinking a lot (one big drawImage step aliases). */
function shrink(src: Src, dw: number, dh: number): Src {
  let cur = src;
  while (cur.width / 2 >= dw && cur.height / 2 >= dh) {
    const [c, x] = mkCanvas(Math.ceil(cur.width / 2), Math.ceil(cur.height / 2));
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur, 0, 0, c.width, c.height);
    cur = c;
  }
  return cur;
}

/** Square (Chebyshev) dilation by r, separable so slider drags stay fast. */
function dilate(a: Uint8Array, size: number, r: number): Uint8Array {
  const tmp = new Uint8Array(a.length), out = new Uint8Array(a.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (a[y * size + x]) for (let dx = Math.max(-r, -x); dx <= Math.min(r, size - 1 - x); dx++) tmp[y * size + x + dx] = 1;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (tmp[y * size + x]) for (let dy = Math.max(-r, -y); dy <= Math.min(r, size - 1 - y); dy++) out[(y + dy) * size + x] = 1;
  return out;
}

// working grids: smooth mode is drawn at full detail, pixelate mode on a 24px grid scaled up 8x (both end at CHAR_OUT)
const SMOOTH = { w: 192, m: 16, edge: 8 };
const PIXEL = { w: 24, m: 2, edge: 1 };

/**
 * Turn any picture into a character sprite:
 * fit (aspect kept) -> optional pixelate+quantize -> hard-edged mask -> optional outline / shadow.
 */
export function renderCharacter(source: Src, o: Settings['character'], out: HTMLCanvasElement): void {
  const src0 = o.crop === 'original' ? trimTransparent(source) : source;
  const { w, m, edge } = o.pixelate ? PIXEL : SMOOTH;
  const size = w + 2 * m;
  const [work, ctx] = mkCanvas(size, size);

  // 1. draw fitted image (cover for masks, contain for original), clipped to the face area
  const fit = o.crop === 'original' ? Math.min(w / src0.width, w / src0.height) : Math.max(w / src0.width, w / src0.height);
  const dw = src0.width * fit * o.zoom, dh = src0.height * fit * o.zoom;
  const src = shrink(src0, dw, dh);
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
  const solid = new Uint8Array(size * size);
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
      solid[y * size + x] = 1;
      d[i + 3] = 255;
      if (o.pixelate) for (let k = 0; k < 3; k++) d[i + k] = Math.round((d[i + k] / 255) * 5) * 51; // 6 levels
    }
  }

  // 3. outline: pixels within `edge` of the picture but not on it
  if (o.outline) {
    const grown = dilate(solid, size, edge);
    for (let p = 0; p < grown.length; p++)
      if (grown[p] && !solid[p]) {
        const i = p * 4;
        d[i] = 0x54; d[i + 1] = 0x38; d[i + 2] = 0x47; d[i + 3] = 255;
      }
  }
  ctx.putImageData(img, 0, 0);

  // 4. optional shadow, then scale to the fixed output size (nearest keeps the pixel grid crisp)
  const [fin, fctx] = mkCanvas(size, size);
  if (o.shadow) {
    const [sh, sctx] = mkCanvas(size, size);
    sctx.drawImage(work, 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, size, size);
    fctx.globalAlpha = 0.28;
    fctx.drawImage(sh, 0, edge);
    fctx.globalAlpha = 1;
  }
  fctx.drawImage(work, 0, 0);

  const octx = out.getContext('2d')!;
  out.width = out.height = CHAR_OUT;
  octx.imageSmoothingEnabled = false;
  octx.clearRect(0, 0, CHAR_OUT, CHAR_OUT);
  octx.drawImage(fin, 0, 0, CHAR_OUT, CHAR_OUT);
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
  private charCanvas = Object.assign(document.createElement('canvas'), { width: CHAR_OUT, height: CHAR_OUT });
  private charTex?: Phaser.Textures.CanvasTexture;

  /** Load previously saved images (called before the game boots). */
  async init(): Promise<void> {
    if (settings.s.customs.character) {
      const blob = await storage.getAsset('character');
      try {
        if (!blob) throw new Error('missing');
        const bmp = await decode(blob);
        this.charSource = bmp;
      } catch {
        settings.update((s) => (s.customs.character = null));
        setTimeout(() => bus.emit('toast', 'Saved custom character was not found. Using default.'), 800);
      }
    }
  }

  /** Create the persistent character canvas texture (updated in place afterwards). */
  attach(textures: Phaser.Textures.TextureManager): void {
    this.charTex = textures.addCanvas('char-custom', this.charCanvas) ?? undefined;
    this.redrawCharacter();
  }

  get hasCharacter(): boolean {
    return this.charSource !== null;
  }

  redrawCharacter(): void {
    if (this.charSource) renderCharacter(this.charSource, settings.s.character, this.charCanvas);
    else this.charCanvas.getContext('2d')!.clearRect(0, 0, CHAR_OUT, CHAR_OUT);
    this.charTex?.setFilter(settings.s.character.pixelate ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR);
    this.charTex?.refresh();
    bus.emit('character');
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

  /** Apply an already-decoded image as the active character and persist the file. */
  async commit(file: File, bmp: ImageBitmap): Promise<SaveResult> {
    const persisted = await storage.putAsset('character', file);
    this.charSource?.close();
    this.charSource = bmp;
    settings.update((s) => (s.customs.character = file.name));
    this.redrawCharacter();
    return { ok: true, persisted };
  }

  async resetCharacter(): Promise<void> {
    this.charSource?.close();
    this.charSource = null;
    await storage.deleteAsset('character');
    settings.reset('character');
    this.redrawCharacter();
  }

  isCustom(kind: Kind): boolean {
    return settings.s.customs[kind] !== null;
  }
}

export const assets = new AssetManager();
