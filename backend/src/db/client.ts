import fs from 'node:fs';
import path from 'node:path';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { env, isProduction } from '../config/env';
import * as schema from './schema';

/**
 * A single database handle type for both drivers.
 *
 * `PGlite` (embedded PostgreSQL compiled to WASM) is used in development and
 * tests so a fresh clone needs zero database installation, while staging and
 * production use a real PostgreSQL server through `node-postgres`. Both speak
 * the same SQL dialect and run the same migrations, and the query builder
 * surface we use is identical, so we expose one type and cast the driver
 * instance to it.
 */
export type Database = PgliteDatabase<typeof schema>;

export type DatabaseHandle = {
  db: Database;
  /** Closes the pool / WASM instance. */
  close: () => Promise<void>;
  /** Underlying driver client, needed by the migration runner. */
  driver: 'pglite' | 'pg';
  raw: unknown;
};

export type DatabaseOptions = {
  /** Explicit connection string, overrides env (used by tests). */
  url?: string;
  /** Explicit PGlite data directory, overrides env (used by tests). */
  dataDir?: string;
};

export const createDatabase = async (options: DatabaseOptions = {}): Promise<DatabaseHandle> => {
  const url = options.url ?? env.DATABASE_URL;

  if (url) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Pool } = require('pg') as typeof import('pg');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { drizzle } = require('drizzle-orm/node-postgres') as typeof import('drizzle-orm/node-postgres');

    const pool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      // Money correctness beats latency: never let a stuck query hang forever.
      statement_timeout: 20_000,
    });

    const db = drizzle(pool, { schema }) as unknown as Database;
    return {
      db,
      driver: 'pg',
      raw: pool,
      close: async () => {
        await pool.end();
      },
    };
  }

  const dataDir = options.dataDir ?? env.PGLITE_DIR;
  const resolvedDir = path.isAbsolute(dataDir) ? dataDir : path.resolve(process.cwd(), dataDir);
  if (resolvedDir !== ':memory:') {
    fs.mkdirSync(resolvedDir, { recursive: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PGlite } = require('@electric-sql/pglite') as typeof import('@electric-sql/pglite');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { drizzle } = require('drizzle-orm/pglite') as typeof import('drizzle-orm/pglite');

  const client = new PGlite(resolvedDir);
  await client.waitReady;

  const db = drizzle(client, { schema }) as unknown as Database;

  return {
    db,
    driver: 'pglite',
    raw: client,
    close: async () => {
      await client.close();
    },
  };
};

let handle: DatabaseHandle | null = null;

/** Lazily created shared handle for the running process. */
export const getDatabaseHandle = async (): Promise<DatabaseHandle> => {
  if (!handle) {
    handle = await createDatabase();
  }
  return handle;
};

export const getDatabase = async (): Promise<Database> => (await getDatabaseHandle()).db;

export const closeDatabase = async (): Promise<void> => {
  if (handle) {
    await handle.close();
    handle = null;
  }
};

/** Works from `src` (tsx) and from `dist` (compiled build). */
const migrationCandidates = [
  path.resolve(__dirname, 'migrations'),
  path.resolve(process.cwd(), 'src/db/migrations'),
];
export const migrationsFolder =
  migrationCandidates.find((candidate) => fs.existsSync(candidate)) ?? migrationCandidates[0];

/** Applies pending migrations. Refuses to run implicitly in production. */
export const runMigrations = async (target: DatabaseHandle, allowInProduction = false): Promise<void> => {
  if (isProduction && !allowInProduction) {
    throw new Error('Refusing to run migrations automatically in production. Use `pnpm db:migrate` in the release step.');
  }

  if (target.driver === 'pg') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { migrate } = require('drizzle-orm/node-postgres/migrator') as typeof import('drizzle-orm/node-postgres/migrator');
    await migrate(target.db as never, { migrationsFolder });
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { migrate } = require('drizzle-orm/pglite/migrator') as typeof import('drizzle-orm/pglite/migrator');
  await migrate(target.db as never, { migrationsFolder });
};

export { schema };
