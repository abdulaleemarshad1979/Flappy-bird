/** Browser-only persistence: LocalStorage for small JSON, Cache Storage for uploaded files. */
const PREFIX = 'authu-bird:';
const CACHE_NAME = 'authu-bird-assets-v1';
const mem = new Map<string, string>(); // fallback when LocalStorage is blocked
const blobs = new Map<string, Blob>(); // session copy of every uploaded file

function ls(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export const storage = {
  getJSON<T>(key: string, fallback: T): T {
    try {
      const raw = ls()?.getItem(PREFIX + key) ?? mem.get(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },

  setJSON(key: string, value: unknown): boolean {
    const raw = JSON.stringify(value);
    mem.set(key, raw);
    try {
      ls()?.setItem(PREFIX + key, raw);
      return ls() !== null;
    } catch {
      return false; // quota or blocked: value stays in memory for this session
    }
  },

  remove(key: string): void {
    mem.delete(key);
    try {
      ls()?.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },

  get cacheAvailable(): boolean {
    return typeof caches !== 'undefined';
  },

  urlFor(kind: string): string {
    return new URL(`__authu_assets__/${kind}`, location.href).href;
  },

  /** Keep the file for this session and try to persist it. Returns true if persisted. */
  async putAsset(kind: string, blob: Blob): Promise<boolean> {
    blobs.set(kind, blob);
    if (!this.cacheAvailable) return false;
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(this.urlFor(kind), new Response(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream' } }));
      return true;
    } catch {
      return false; // QuotaExceededError etc.
    }
  },

  async getAsset(kind: string): Promise<Blob | null> {
    const m = blobs.get(kind);
    if (m) return m;
    if (!this.cacheAvailable) return null;
    try {
      const cache = await caches.open(CACHE_NAME);
      const res = await cache.match(this.urlFor(kind));
      if (!res) return null;
      const b = await res.blob();
      blobs.set(kind, b);
      return b;
    } catch {
      return null;
    }
  },

  async deleteAsset(kind: string): Promise<void> {
    blobs.delete(kind);
    if (!this.cacheAvailable) return;
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.delete(this.urlFor(kind));
    } catch {
      /* ignore */
    }
  },
};
