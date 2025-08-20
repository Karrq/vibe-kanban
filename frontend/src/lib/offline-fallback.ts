/**
 * Fallback offline support for non-HTTPS environments
 * Uses localStorage for simpler caching when service workers aren't available
 */

const STORAGE_PREFIX = 'vibe-kanban-cache-';
const CACHE_EXPIRY = 1000 * 60 * 60; // 1 hour

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class OfflineFallback {
  private isAvailable: boolean;

  constructor() {
    // Check if we can use localStorage
    try {
      const test = '__localStorage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      this.isAvailable = true;
    } catch {
      this.isAvailable = false;
      console.warn('localStorage not available - offline caching disabled');
    }
  }

  /**
   * Save data to localStorage cache
   */
  set<T>(key: string, data: T): void {
    if (!this.isAvailable) return;

    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
      };
      localStorage.setItem(
        STORAGE_PREFIX + key,
        JSON.stringify(entry)
      );
    } catch (e) {
      // Handle quota exceeded or other errors
      console.warn('Failed to cache data:', e);
      this.clearOldEntries();
    }
  }

  /**
   * Get data from localStorage cache
   */
  get<T>(key: string): T | null {
    if (!this.isAvailable) return null;

    try {
      const item = localStorage.getItem(STORAGE_PREFIX + key);
      if (!item) return null;

      const entry: CacheEntry<T> = JSON.parse(item);
      
      // Check if cache is expired
      if (Date.now() - entry.timestamp > CACHE_EXPIRY) {
        localStorage.removeItem(STORAGE_PREFIX + key);
        return null;
      }

      return entry.data;
    } catch {
      return null;
    }
  }

  /**
   * Check if cached data exists and is valid
   */
  has(key: string): boolean {
    if (!this.isAvailable) return false;
    return this.get(key) !== null;
  }

  /**
   * Get age of cached data in milliseconds
   */
  getAge(key: string): number | null {
    if (!this.isAvailable) return null;

    try {
      const item = localStorage.getItem(STORAGE_PREFIX + key);
      if (!item) return null;

      const entry: CacheEntry<any> = JSON.parse(item);
      return Date.now() - entry.timestamp;
    } catch {
      return null;
    }
  }

  /**
   * Clear specific cache entry
   */
  remove(key: string): void {
    if (!this.isAvailable) return;
    localStorage.removeItem(STORAGE_PREFIX + key);
  }

  /**
   * Clear all cache entries
   */
  clearAll(): void {
    if (!this.isAvailable) return;

    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * Clear old cache entries to free up space
   */
  private clearOldEntries(): void {
    if (!this.isAvailable) return;

    const keys = Object.keys(localStorage);
    const now = Date.now();
    let cleared = 0;

    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        try {
          const item = localStorage.getItem(key);
          if (item) {
            const entry: CacheEntry<any> = JSON.parse(item);
            if (now - entry.timestamp > CACHE_EXPIRY) {
              localStorage.removeItem(key);
              cleared++;
            }
          }
        } catch {
          // Remove corrupted entries
          localStorage.removeItem(key);
        }
      }
    });

    console.log(`Cleared ${cleared} expired cache entries`);
  }

  /**
   * Get storage usage info
   */
  getStorageInfo(): { used: number; available: boolean } {
    if (!this.isAvailable) {
      return { used: 0, available: false };
    }

    let used = 0;
    const keys = Object.keys(localStorage);
    
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        const item = localStorage.getItem(key);
        if (item) {
          used += item.length + key.length;
        }
      }
    });

    return { used, available: true };
  }
}

export const offlineFallback = new OfflineFallback();