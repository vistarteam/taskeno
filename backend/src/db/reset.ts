import fs from 'node:fs/promises';
import path from 'node:path';
import { env, isProduction, pgliteDir } from '../config/env';

/**
 * Development helper: wipes the embedded database so migrations and seed can be
 * replayed from scratch. Refuses to run against a real server or in production —
 * there is deliberately no way to drop a hosted database from this script.
 */
const main = async (): Promise<void> => {
  if (isProduction) {
    throw new Error('db:reset must never run in production');
  }
  if (env.DATABASE_URL) {
    throw new Error('db:reset only manages the embedded PGlite directory; DATABASE_URL is set, refusing to continue');
  }

  const target = path.resolve(pgliteDir);
  await fs.rm(target, { recursive: true, force: true });
  // eslint-disable-next-line no-console
  console.log(`[reset] removed ${target}. Run \`pnpm db:migrate && pnpm db:seed\` next.`);
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[reset] failed:', error);
  process.exit(1);
});
