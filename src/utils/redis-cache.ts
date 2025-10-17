import { Redis } from 'ioredis';
import { CacheProvider } from '../types';

export interface RedisCacheConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  enableOfflineQueue?: boolean;
}

export class RedisCache implements CacheProvider {
  private client: Redis;
  private keyPrefix: string;

  constructor(config?: RedisCacheConfig) {
    const {
      host = 'localhost',
      port = 6379,
      password,
      db = 0,
      keyPrefix = 'attendance:',
      enableOfflineQueue = false,
    } = config || {};

    this.client = new Redis({
      host,
      port,
      password,
      db,
      enableOfflineQueue,
      lazyConnect: false,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.keyPrefix = keyPrefix;
  }

  private prefixKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(this.prefixKey(key));
      
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Redis get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const prefixedKey = this.prefixKey(key);

      if (ttlSeconds) {
        await this.client.setex(prefixedKey, ttlSeconds, serialized);
      } else {
        await this.client.set(prefixedKey, serialized);
      }
    } catch (error) {
      console.error(`Redis set error for key ${key}:`, error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(this.prefixKey(key));
    } catch (error) {
      console.error(`Redis delete error for key ${key}:`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      const keys = await this.client.keys(`${this.keyPrefix}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      console.error('Redis clear error:', error);
    }
  }

  async getWithETag<T>(key: string): Promise<{ value: T; etag: string } | null> {
    try {
      const value = await this.get<T>(key);
      if (!value) {
        return null;
      }

      const etag = await this.client.get(this.prefixKey(`${key}:etag`));
      return {
        value,
        etag: etag || this.generateETag(value),
      };
    } catch (error) {
      console.error(`Redis getWithETag error for key ${key}:`, error);
      return null;
    }
  }

  async setWithETag<T>(key: string, value: T, ttlSeconds?: number): Promise<string> {
    const etag = this.generateETag(value);
    
    try {
      await this.set(key, value, ttlSeconds);
      await this.set(`${key}:etag`, etag, ttlSeconds);
      return etag;
    } catch (error) {
      console.error(`Redis setWithETag error for key ${key}:`, error);
      throw error;
    }
  }

  private generateETag(value: any): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(value));
    return `"${hash.digest('hex').substring(0, 16)}"`;
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  getClient(): Redis {
    return this.client;
  }
}
