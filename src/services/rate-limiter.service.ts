import { Redis } from 'ioredis';
import { RateLimitResult } from '../types';

export interface RateLimiterConfig {
  redis: Redis;
  maxRequestsPerWindow?: number;
  windowSeconds?: number;
  keyPrefix?: string;
}

export class RateLimiterService {
  private redis: Redis;
  private maxRequestsPerWindow: number;
  private windowSeconds: number;
  private keyPrefix: string;

  constructor(config: RateLimiterConfig) {
    this.redis = config.redis;
    this.maxRequestsPerWindow = config.maxRequestsPerWindow ?? 12;
    this.windowSeconds = config.windowSeconds ?? 60;
    this.keyPrefix = config.keyPrefix ?? 'rate_limit:';
  }

  async checkRateLimit(userId: string): Promise<RateLimitResult> {
    const key = `${this.keyPrefix}${userId}`;
    const now = Date.now();
    const windowStart = now - this.windowSeconds * 1000;

    try {
      await this.redis.zremrangebyscore(key, 0, windowStart);

      const currentCount = await this.redis.zcard(key);

      if (currentCount >= this.maxRequestsPerWindow) {
        const oldestTimestamp = await this.redis.zrange(key, 0, 0, 'WITHSCORES');
        const resetTimestamp = oldestTimestamp[1] 
          ? parseInt(oldestTimestamp[1]) + this.windowSeconds * 1000
          : now + this.windowSeconds * 1000;

        return {
          passed: false,
          limit: this.maxRequestsPerWindow,
          remaining: 0,
          reset_at: new Date(resetTimestamp),
          blocked: true,
        };
      }

      await this.redis.zadd(key, now, `${now}:${Math.random()}`);
      await this.redis.expire(key, this.windowSeconds * 2);

      const remaining = this.maxRequestsPerWindow - currentCount - 1;
      const resetAt = new Date(now + this.windowSeconds * 1000);

      return {
        passed: true,
        limit: this.maxRequestsPerWindow,
        remaining: Math.max(0, remaining),
        reset_at: resetAt,
        blocked: false,
      };
    } catch (error) {
      console.error('Rate limiter error:', error);
      return {
        passed: true,
        limit: this.maxRequestsPerWindow,
        remaining: this.maxRequestsPerWindow,
        reset_at: new Date(now + this.windowSeconds * 1000),
        blocked: false,
      };
    }
  }

  async resetRateLimit(userId: string): Promise<void> {
    const key = `${this.keyPrefix}${userId}`;
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error('Rate limiter reset error:', error);
    }
  }

  async getRateLimitInfo(userId: string): Promise<{
    current: number;
    limit: number;
    remaining: number;
  }> {
    const key = `${this.keyPrefix}${userId}`;
    const now = Date.now();
    const windowStart = now - this.windowSeconds * 1000;

    try {
      await this.redis.zremrangebyscore(key, 0, windowStart);
      const currentCount = await this.redis.zcard(key);
      
      return {
        current: currentCount,
        limit: this.maxRequestsPerWindow,
        remaining: Math.max(0, this.maxRequestsPerWindow - currentCount),
      };
    } catch (error) {
      console.error('Rate limiter info error:', error);
      return {
        current: 0,
        limit: this.maxRequestsPerWindow,
        remaining: this.maxRequestsPerWindow,
      };
    }
  }
}
