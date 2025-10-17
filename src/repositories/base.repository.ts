import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { CacheProvider } from '../types';

export interface RepositoryConfig {
  pool: Pool;
  cache?: CacheProvider;
  defaultCacheTtl?: number;
}

export abstract class BaseRepository {
  protected pool: Pool;
  protected cache?: CacheProvider;
  protected defaultCacheTtl: number;

  constructor(config: RepositoryConfig) {
    this.pool = config.pool;
    this.cache = config.cache;
    this.defaultCacheTtl = config.defaultCacheTtl || 300;
  }

  protected async query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  protected async getClient(): Promise<PoolClient> {
    return this.pool.connect();
  }

  protected async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  protected getCacheKey(prefix: string, id: string): string {
    return `${prefix}:${id}`;
  }

  protected async getCached<T>(key: string): Promise<T | null> {
    if (!this.cache) {
      return null;
    }
    return this.cache.get<T>(key);
  }

  protected async setCached<T>(key: string, value: T, ttl?: number): Promise<void> {
    if (!this.cache) {
      return;
    }
    await this.cache.set(key, value, ttl ?? this.defaultCacheTtl);
  }

  protected async deleteCached(key: string): Promise<void> {
    if (!this.cache) {
      return;
    }
    await this.cache.delete(key);
  }
}
