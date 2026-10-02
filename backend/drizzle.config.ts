import { defineConfig } from 'drizzle-kit';

/**
 * Migration generation config.
 *
 * `drizzle-kit generate` only needs the schema: it writes versioned SQL files
 * into `src/db/migrations`, which the application then applies with the
 * matching driver (PGlite in development, node-postgres in production).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://taskeno:taskeno@localhost:5432/taskeno',
  },
});
