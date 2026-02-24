import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'comments.db');

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      vault TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      parent_id TEXT,
      created_at INTEGER NOT NULL,
      deleted INTEGER DEFAULT 0,
      FOREIGN KEY (parent_id) REFERENCES comments(id)
    );
    CREATE INDEX IF NOT EXISTS idx_vault ON comments(vault, created_at);
    CREATE INDEX IF NOT EXISTS idx_parent ON comments(parent_id);
  `);

  return db;
}

export interface CommentRow {
  id: string;
  vault: string;
  author: string;
  content: string;
  parent_id: string | null;
  created_at: number;
  deleted: number;
}

export function getCommentsByVault(vault: string): CommentRow[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM comments WHERE vault = ? AND deleted = 0 ORDER BY created_at ASC'
  ).all(vault.toLowerCase()) as CommentRow[];
}

export function createComment(params: {
  id: string;
  vault: string;
  author: string;
  content: string;
  parentId: string | null;
}): CommentRow {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  db.prepare(
    'INSERT INTO comments (id, vault, author, content, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(params.id, params.vault.toLowerCase(), params.author.toLowerCase(), params.content, params.parentId, now);

  return db.prepare('SELECT * FROM comments WHERE id = ?').get(params.id) as CommentRow;
}

export function softDeleteComment(id: string, author: string): boolean {
  const db = getDb();
  const result = db.prepare(
    'UPDATE comments SET deleted = 1 WHERE id = ? AND author = ? AND deleted = 0'
  ).run(id, author.toLowerCase());
  return result.changes > 0;
}

export function getCommentById(id: string): CommentRow | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM comments WHERE id = ?').get(id) as CommentRow | undefined;
}

export function countRecentComments(author: string, windowSeconds: number): number {
  const db = getDb();
  const since = Math.floor(Date.now() / 1000) - windowSeconds;
  const row = db.prepare(
    'SELECT COUNT(*) as count FROM comments WHERE author = ? AND created_at > ?'
  ).get(author.toLowerCase(), since) as { count: number };
  return row.count;
}
