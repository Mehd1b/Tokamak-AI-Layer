import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '..', 'subscriptions.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ── Schema ──

db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    chat_id      INTEGER NOT NULL,
    vault_address TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (chat_id, vault_address)
  );

  CREATE INDEX IF NOT EXISTS idx_subscriptions_vault
    ON subscriptions (vault_address);

  CREATE TABLE IF NOT EXISTS state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ── Prepared statements ──

const stmtAdd = db.prepare(`
  INSERT OR IGNORE INTO subscriptions (chat_id, vault_address)
  VALUES (?, ?)
`);

const stmtRemove = db.prepare(`
  DELETE FROM subscriptions
  WHERE chat_id = ? AND vault_address = ?
`);

const stmtByVault = db.prepare(`
  SELECT chat_id FROM subscriptions
  WHERE vault_address = ?
`);

const stmtByChat = db.prepare(`
  SELECT vault_address, created_at FROM subscriptions
  WHERE chat_id = ?
  ORDER BY created_at DESC
`);

const stmtGetState = db.prepare(`
  SELECT value FROM state WHERE key = ?
`);

const stmtSetState = db.prepare(`
  INSERT INTO state (key, value) VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);

// ── Public API ──

export function addSubscription(chatId: number, vaultAddress: string): boolean {
  const normalized = vaultAddress.toLowerCase();
  const result = stmtAdd.run(chatId, normalized);
  return result.changes > 0;
}

export function removeSubscription(chatId: number, vaultAddress: string): boolean {
  const normalized = vaultAddress.toLowerCase();
  const result = stmtRemove.run(chatId, normalized);
  return result.changes > 0;
}

export function getSubscriptionsForVault(vaultAddress: string): number[] {
  const normalized = vaultAddress.toLowerCase();
  const rows = stmtByVault.all(normalized) as { chat_id: number }[];
  return rows.map((r) => r.chat_id);
}

export interface Subscription {
  vault_address: string;
  created_at: string;
}

export function getSubscriptionsForChat(chatId: number): Subscription[] {
  return stmtByChat.all(chatId) as Subscription[];
}

export function getAllSubscribedVaults(): string[] {
  const rows = db
    .prepare('SELECT DISTINCT vault_address FROM subscriptions')
    .all() as { vault_address: string }[];
  return rows.map((r) => r.vault_address);
}

export function getLastProcessedBlock(): bigint | null {
  const row = stmtGetState.get('last_block') as { value: string } | undefined;
  return row ? BigInt(row.value) : null;
}

export function setLastProcessedBlock(blockNumber: bigint): void {
  stmtSetState.run('last_block', blockNumber.toString());
}

export function closeDb(): void {
  db.close();
}
