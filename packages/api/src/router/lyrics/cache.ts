interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Small in-memory TTL cache with an insertion-order eviction bound.
 * Lyrics are never persisted to disk or Redis; every entry expires well
 * within the 30-day window required by the Spicy Lyrics API terms.
 */
export class TtlLruCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly positiveTtlMs: number,
    private readonly negativeTtlMs: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh insertion order so frequently used entries survive eviction.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, positive: boolean): void {
    this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + (positive ? this.positiveTtlMs : this.negativeTtlMs),
    });
  }

  clear(): void {
    this.entries.clear();
  }
}
