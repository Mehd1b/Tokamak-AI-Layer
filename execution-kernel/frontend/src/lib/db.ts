import { sql } from '@vercel/postgres';

let initialized = false;

async function ensureTable() {
  if (initialized) return;

  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      vault TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      parent_id TEXT REFERENCES comments(id),
      created_at INTEGER NOT NULL,
      deleted INTEGER DEFAULT 0
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_vault ON comments(vault, created_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_parent ON comments(parent_id)`;

  initialized = true;
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

export async function getCommentsByVault(vault: string): Promise<CommentRow[]> {
  await ensureTable();
  const { rows } = await sql`
    SELECT * FROM comments
    WHERE vault = ${vault.toLowerCase()} AND deleted = 0
    ORDER BY created_at ASC
  `;
  return rows as CommentRow[];
}

export async function createComment(params: {
  id: string;
  vault: string;
  author: string;
  content: string;
  parentId: string | null;
}): Promise<CommentRow> {
  await ensureTable();
  const now = Math.floor(Date.now() / 1000);

  await sql`
    INSERT INTO comments (id, vault, author, content, parent_id, created_at)
    VALUES (${params.id}, ${params.vault.toLowerCase()}, ${params.author.toLowerCase()}, ${params.content}, ${params.parentId}, ${now})
  `;

  const { rows } = await sql`SELECT * FROM comments WHERE id = ${params.id}`;
  return rows[0] as CommentRow;
}

export async function softDeleteComment(id: string, author: string): Promise<boolean> {
  await ensureTable();
  const { rowCount } = await sql`
    UPDATE comments SET deleted = 1
    WHERE id = ${id} AND author = ${author.toLowerCase()} AND deleted = 0
  `;
  return (rowCount ?? 0) > 0;
}

export async function getCommentById(id: string): Promise<CommentRow | undefined> {
  await ensureTable();
  const { rows } = await sql`SELECT * FROM comments WHERE id = ${id}`;
  return rows[0] as CommentRow | undefined;
}

export async function countRecentComments(author: string, windowSeconds: number): Promise<number> {
  await ensureTable();
  const since = Math.floor(Date.now() / 1000) - windowSeconds;
  const { rows } = await sql`
    SELECT COUNT(*) as count FROM comments
    WHERE author = ${author.toLowerCase()} AND created_at > ${since}
  `;
  return Number(rows[0].count);
}
