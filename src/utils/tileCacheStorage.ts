import { getTileCoordinatesForBounds } from './routingEngine';
import { buildTileUrl, fetchWithTimeout, isBrowserOnline } from './config';

/**
 * Offline map-tile archive backed by IndexedDB (binary Blobs, not data URLs).
 *
 * Tiles are stored once per *source* — the street / terrain / nocturnal looks
 * are CSS filters over the same raster, so the old per-style duplication is gone.
 * Only real downloaded tiles are archived; the previous version stored
 * synthetic SVG "tiles" (with invented rivers and highways) and counted them as
 * offline maps.
 */

export interface TileCacheStats {
  tileCount: number;
  totalBytes: number;
  downloadedPacks: string[];
  lastUpdated: number | null;
}

export interface TileDownloadResult {
  stats: TileCacheStats;
  fetched: number;
  skipped: number;
  failed: number;
  total: number;
}

interface TileRecord {
  key: string;
  blob: Blob;
  sizeBytes: number;
  cachedAt: number;
}

const DB_NAME = 'wayfarer-tiles-v5';
const LEGACY_DB_NAMES = ['wayfarer-ph-tile-db-v4'];
const STORE_NAME = 'tiles';
const PACKS_STORAGE_KEY = 'wayfarer_downloaded_packs_v5';
const SOURCE_PREFIX = 'osm';

/** Lightweight index (no blobs) so stats and `hasCachedTile` are synchronous. */
const tileIndex = new Map<string, { sizeBytes: number; cachedAt: number }>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function tileKey(z: number, x: number, y: number): string {
  return `${SOURCE_PREFIX}/${z}/${x}/${y}`;
}

function openTileDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      for (const legacy of LEGACY_DB_NAMES) {
        try {
          indexedDB.deleteDatabase(legacy);
        } catch {
          /* ignore */
        }
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

/** Neutral placeholder for areas that are neither online nor archived. */
export function generatePlaceholderTileSvg(z: number, x: number, y: number, dark = true): string {
  const bg = dark ? '#18181b' : '#ecebe7';
  const grid = dark ? '#27272a' : '#d9d7d0';
  const text = dark ? '#52525b' : '#a1a19a';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="${bg}"/><g stroke="${grid}" stroke-width="1"><path d="M64 0V256M128 0V256M192 0V256M0 64H256M0 128H256M0 192H256"/></g><rect width="256" height="256" fill="none" stroke="${grid}"/><text x="128" y="132" text-anchor="middle" font-family="monospace" font-size="10" fill="${text}">NOT CACHED · ${z}/${x}/${y}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** @deprecated kept for backwards compatibility — returns the neutral placeholder. */
export function generateVectorCartographicTileSvg(
  z: number,
  x: number,
  y: number,
  style: 'street' | 'terrain' | 'dark' = 'street'
): string {
  return generatePlaceholderTileSvg(z, x, y, style === 'dark');
}

export async function hydrateMemoryCacheFromIndexedDB(): Promise<TileCacheStats> {
  const db = await openTileDatabase();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) {
            resolve();
            return;
          }
          const rec = cursor.value as TileRecord;
          tileIndex.set(rec.key, { sizeBytes: rec.sizeBytes, cachedAt: rec.cachedAt });
          cursor.continue();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  return getTileCacheStats();
}

export function hasCachedTile(z: number, x: number, y: number): boolean {
  return tileIndex.has(tileKey(z, x, y));
}

/** Resolves an object URL for an archived tile. Caller must `URL.revokeObjectURL` it. */
export async function getCachedTileObjectUrl(z: number, x: number, y: number): Promise<string | null> {
  const key = tileKey(z, x, y);
  if (!tileIndex.has(key)) return null;
  const db = await openTileDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const rec = req.result as TileRecord | undefined;
        resolve(rec?.blob ? URL.createObjectURL(rec.blob) : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveTile(key: string, blob: Blob): Promise<void> {
  const record: TileRecord = { key, blob, sizeBytes: blob.size, cachedAt: Date.now() };
  const db = await openTileDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => {
        tileIndex.set(key, { sizeBytes: record.sizeBytes, cachedAt: record.cachedAt });
        resolve();
      };
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function fetchTileBlob(z: number, x: number, y: number): Promise<Blob | null> {
  try {
    const res = await fetchWithTimeout(buildTileUrl(z, x, y), 10000, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

/**
 * Downloads real tiles for a bounding box into the offline archive.
 * Requests are throttled (2 concurrent) to respect the public tile server's usage policy.
 */
export async function cacheBoundingBoxTiles(
  southWest: { lat: number; lng: number },
  northEast: { lat: number; lng: number },
  zoomLevels: number[] = [11, 12],
  onProgress?: (completed: number, total: number) => void,
  packId?: string,
  maxTiles = 1500
): Promise<TileDownloadResult> {
  const coords = getTileCoordinatesForBounds(southWest, northEast, zoomLevels, maxTiles);
  const total = coords.length;
  let completed = 0;
  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  if (!isBrowserOnline()) {
    return { stats: getTileCacheStats(), fetched, skipped, failed: total, total };
  }

  let cursor = 0;
  const worker = async () => {
    while (cursor < coords.length) {
      const item = coords[cursor++];
      const key = tileKey(item.z, item.x, item.y);
      if (tileIndex.has(key)) {
        skipped++;
      } else {
        const blob = await fetchTileBlob(item.z, item.x, item.y);
        if (blob) {
          await saveTile(key, blob);
          fetched++;
        } else {
          failed++;
        }
      }
      completed++;
      onProgress?.(completed, total);
    }
  };
  await Promise.all([worker(), worker()]);

  if (packId && failed < total * 0.2) {
    const existing = getDownloadedPackIds();
    if (!existing.includes(packId)) {
      try {
        localStorage.setItem(PACKS_STORAGE_KEY, JSON.stringify([...existing, packId]));
      } catch {
        /* ignore */
      }
    }
  }

  return { stats: getTileCacheStats(), fetched, skipped, failed, total };
}

export function estimateTileCount(
  southWest: { lat: number; lng: number },
  northEast: { lat: number; lng: number },
  zoomLevels: number[],
  maxTiles = 1500
): number {
  return getTileCoordinatesForBounds(southWest, northEast, zoomLevels, maxTiles).length;
}

export function getDownloadedPackIds(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PACKS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getTileCacheStats(): TileCacheStats {
  let totalBytes = 0;
  let lastUpdated: number | null = null;
  for (const rec of tileIndex.values()) {
    totalBytes += rec.sizeBytes;
    if (!lastUpdated || rec.cachedAt > lastUpdated) lastUpdated = rec.cachedAt;
  }
  return {
    tileCount: tileIndex.size,
    totalBytes,
    downloadedPacks: getDownloadedPackIds(),
    lastUpdated,
  };
}

export async function clearAllCachedTiles(): Promise<TileCacheStats> {
  tileIndex.clear();
  try {
    localStorage.setItem(PACKS_STORAGE_KEY, JSON.stringify([]));
  } catch {
    /* ignore */
  }
  const db = await openTileDatabase();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
  // Also drop the service worker's runtime tile cache.
  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.includes('tiles')).map((n) => caches.delete(n)));
    } catch {
      /* ignore */
    }
  }
  return getTileCacheStats();
}

/** Asks the browser to protect offline data from automatic eviction. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return { usage: est.usage || 0, quota: est.quota || 0 };
    }
  } catch {
    /* ignore */
  }
  return null;
}
