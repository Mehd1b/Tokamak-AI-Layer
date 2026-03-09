import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, closePool } from './client.js';
import pino from 'pino';

const logger = pino({ name: 'migrate' });
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  // Create migrations tracking table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  const migrationsDir = path.join(__dirname, 'migrations');

  // Handle both source and compiled paths
  let sqlDir = migrationsDir;
  if (!fs.existsSync(sqlDir)) {
    // When running from dist/, look for SQL files relative to project root
    sqlDir = path.join(__dirname, '..', '..', 'src', 'db', 'migrations');
  }
  if (!fs.existsSync(sqlDir)) {
    // Docker: migrations copied to /app/src/db/migrations
    sqlDir = path.join(process.cwd(), 'src', 'db', 'migrations');
  }

  if (!fs.existsSync(sqlDir)) {
    logger.warn({ tried: [migrationsDir, sqlDir] }, 'No migrations directory found');
    return;
  }

  const files = fs.readdirSync(sqlDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM _migrations WHERE filename = $1',
      [file]
    );

    if (rows.length > 0) {
      logger.info({ file }, 'Migration already applied');
      continue;
    }

    const sql = fs.readFileSync(path.join(sqlDir, file), 'utf-8');
    await pool.query(sql);
    await pool.query(
      'INSERT INTO _migrations (filename) VALUES ($1)',
      [file]
    );
    logger.info({ file }, 'Migration applied');
  }
}

// Allow running directly
if (process.argv[1] && process.argv[1].includes('migrate')) {
  runMigrations()
    .then(() => {
      logger.info('All migrations complete');
      return closePool();
    })
    .catch((err) => {
      logger.error({ err }, 'Migration failed');
      process.exit(1);
    });
}
