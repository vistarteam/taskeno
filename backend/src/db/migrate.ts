import { createDatabase, runMigrations } from './client';
import { env } from '../config/env';

/**
 * Applies pending migrations and exits. Run this in the release step before
 * restarting the API/worker (`pnpm db:migrate`).
 */
const main = async (): Promise<void> => {
  const handle = await createDatabase();
  // eslint-disable-next-line no-console
  console.log(`[migrate] driver=${handle.driver} env=${env.NODE_ENV}`);
  await runMigrations(handle, true);
  // Close the handle we created: `closeDatabase()` only closes the shared
  // singleton, which this script never registered, so the PGlite instance (and
  // the process with it) would otherwise stay alive forever.
  await handle.close();
  // eslint-disable-next-line no-console
  console.log('[migrate] done');
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] failed:', error);
  process.exit(1);
});
