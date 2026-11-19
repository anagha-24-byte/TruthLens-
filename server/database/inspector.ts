import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../config.ts';

const db = new DatabaseSync(DB_PATH);

// Remove temporary verification rows if any exist
try {
  db.prepare("DELETE FROM investigators WHERE email LIKE 'verify_%@gmail.com'").run();
} catch {
  // ignore if table not yet created
}

export interface DatabaseColumnMeta {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
}

export interface DatabaseTableSnapshot {
  name: string;
  rowCount: number;
  columns: DatabaseColumnMeta[];
  rows: Array<Record<string, string | number | null>>;
}

function maskEmailValue(email: string): string {
  const parts = email.split('@');
  const domain = parts[1]?.trim() || 'gmail.com';
  return `************@${domain}`;
}

function sanitizeCellValue(tableName: string, colName: string, val: unknown): string | number | null {
  if (val === null || val === undefined) return null;

  if (colName === 'password_salt' || colName === 'password_hash') {
    return '[REDACTED]';
  }
  if (tableName === 'auth_sessions' && colName === 'token') {
    const s = String(val);
    return s.length > 10 ? `${s.slice(0, 6)}••••••••${s.slice(-4)}` : '[REDACTED]';
  }
  if (colName === 'email') {
    return maskEmailValue(String(val));
  }
  if (colName === 'payload_json' || colName === 'submitted_context_json') {
    const str = String(val);
    return `[JSON · ${(str.length / 1024).toFixed(1)} KB]`;
  }
  if (typeof val === 'number') return val;
  const text = String(val);
  return text.length > 140 ? `${text.slice(0, 137)}...` : text;
}

export function getDatabaseTablesSnapshot(): {
  databaseFile: string;
  engine: string;
  tables: DatabaseTableSnapshot[];
} {
  const tableRows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as Array<{ name: string }>;

  const tables: DatabaseTableSnapshot[] = tableRows.map(({ name }) => {
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '');
    const pragmaCols = db.prepare(`PRAGMA table_info(${safeName})`).all() as Array<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>;

    const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM ${safeName}`).get() as { cnt: number };
    const rawRows = db.prepare(`SELECT * FROM ${safeName} LIMIT 50`).all() as Array<Record<string, unknown>>;

    const columns: DatabaseColumnMeta[] = pragmaCols.map((c) => ({
      name: c.name,
      type: c.type || 'TEXT',
      notNull: Boolean(c.notnull),
      primaryKey: Boolean(c.pk),
    }));

    const rows = rawRows.map((row) => {
      const sanitized: Record<string, string | number | null> = {};
      for (const col of columns) {
        sanitized[col.name] = sanitizeCellValue(safeName, col.name, row[col.name]);
      }
      return sanitized;
    });

    return {
      name: safeName,
      rowCount: Number(countRow.cnt || 0),
      columns,
      rows,
    };
  });

  return {
    databaseFile: 'data/truthlens.db',
    engine: 'SQLite (node:sqlite)',
    tables,
  };
}
