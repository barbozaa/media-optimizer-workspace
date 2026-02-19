/**
 * LRU (Least Recently Used) Cache implementation
 * Provides bounded memory cache with automatic eviction
 * Uses Map's insertion order for O(1) eviction
 * @internal
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Get value from cache
   * Updates access order (moves to end) for LRU tracking
   * O(1) operation
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  /**
   * Set value in cache
   * Evicts least recently used entry (first in Map) if at capacity
   * O(1) operation
   */
  set(key: K, value: V): void {
    // If key exists, delete it first to update position
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first entry in Map)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    // Add as most recently used (end of Map)
    this.cache.set(key, value);
  }

  /**
   * Check if key exists in cache
   * O(1) operation
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }
}
