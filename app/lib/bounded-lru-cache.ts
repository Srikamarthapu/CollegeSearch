type BoundedLruOptions<Value> = {
  maxEntries: number;
  maxBytes: number;
  maxEntryBytes: number;
  ttlMs: number;
  measureBytes: (value: Value) => number;
};

type Entry<Value> = {
  expiresAt: number;
  sizeBytes: number;
  value: Value;
};

/** A small process-local LRU with explicit entry, size, and age bounds. */
export class BoundedLruCache<Value> {
  private readonly entries = new Map<string, Entry<Value>>();
  private currentBytes = 0;
  private readonly options: BoundedLruOptions<Value>;

  constructor(options: BoundedLruOptions<Value>) {
    this.options = options;
    if (
      !Number.isSafeInteger(options.maxEntries) ||
      options.maxEntries < 1 ||
      !Number.isSafeInteger(options.maxBytes) ||
      options.maxBytes < 1 ||
      !Number.isSafeInteger(options.maxEntryBytes) ||
      options.maxEntryBytes < 1 ||
      !Number.isFinite(options.ttlMs) ||
      options.ttlMs <= 0
    ) {
      throw new Error("Bounded LRU cache limits must be positive.");
    }
  }

  get(key: string, now = Date.now()) {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: Value, now = Date.now()) {
    const sizeBytes = this.options.measureBytes(value);
    if (
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 0 ||
      sizeBytes > this.options.maxEntryBytes ||
      sizeBytes > this.options.maxBytes
    ) {
      this.delete(key);
      return false;
    }

    this.delete(key);
    while (
      this.entries.size >= this.options.maxEntries ||
      this.currentBytes + sizeBytes > this.options.maxBytes
    ) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }
    this.entries.set(key, {
      value,
      sizeBytes,
      expiresAt: now + this.options.ttlMs,
    });
    this.currentBytes += sizeBytes;
    return true;
  }

  delete(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    this.currentBytes -= entry.sizeBytes;
    return true;
  }

  clear() {
    this.entries.clear();
    this.currentBytes = 0;
  }

  get size() {
    return this.entries.size;
  }

  get sizeBytes() {
    return this.currentBytes;
  }
}
