import { CacheContainer } from "node-ts-cache";

export class CacheService<T> {
  private cache: CacheContainer;
  private ttl: number;

  constructor(storage: any, ttl: number = 3600) {
    this.cache = new CacheContainer(storage);
    this.ttl = ttl;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.cache.getItem<T>(key);
    return value === undefined ? null : value;
  }

  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    await this.cache.setItem(key, value, {
      ttl: options?.ttl || this.ttl,
    });
  }
}
