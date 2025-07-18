// Database Pool Module - Centralized database connection management
import { Pool, PoolClient } from 'pg';

export class DatabasePool {
  private static instance: Pool;

  static getInstance(): Pool {
    if (!DatabasePool.instance) {
      DatabasePool.instance = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 100,
        min: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });
    }
    return DatabasePool.instance;
  }

  static async getClient(): Promise<PoolClient> {
    const pool = this.getInstance();
    return pool.connect();
  }

  static async query(text: string, params?: any[]) {
    const pool = this.getInstance();
    return pool.query(text, params);
  }

  static async end() {
    if (DatabasePool.instance) {
      await DatabasePool.instance.end();
    }
  }
}

export const pool = DatabasePool.getInstance();