import pg from 'pg';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS aws_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  profile_name TEXT NOT NULL,
  access_key_enc TEXT NOT NULL,
  secret_key_enc TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'ap-south-1',
  created_at TEXT DEFAULT (datetime('now')),
  sb_ref TEXT
);

CREATE TABLE IF NOT EXISTS instance_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('start','stop')),
  time TEXT NOT NULL,
  instance_ids TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_fired TEXT,
  sb_ref TEXT
);

CREATE TABLE IF NOT EXISTS instance_auto_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER NOT NULL,
  instance_id TEXT NOT NULL,
  auto_enabled INTEGER NOT NULL DEFAULT 0,
  on_time TEXT,
  off_time TEXT,
  shrink_enabled INTEGER NOT NULL DEFAULT 0,
  last_on_fired TEXT,
  last_off_fired TEXT,
  shrunk_on TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  sb_ref TEXT,
  UNIQUE (profile_id, instance_id)
);

CREATE INDEX IF NOT EXISTS idx_schedules_profile ON instance_schedules(profile_id);
CREATE INDEX IF NOT EXISTS idx_auto_config_profile ON instance_auto_config(profile_id);
`;

const DATABASE_URL = internalizePgUrl(process.env.DATABASE_URL);

// Render free Postgres blocks public/external connections (IP allow list).
// When running on Render, rewrite the external host to the private/internal one.
function internalizePgUrl(url) {
  if (!url) return url;
  try {
    const u = new URL(url);
    const m = u.hostname.match(/^([a-z0-9-]+)\.[a-z0-9-]+-postgres\.render\.com$/i);
    if (m && process.env.RENDER) {
      u.hostname = m[1];
      u.port = '';
      return u.toString();
    }
  } catch { /* ignore */ }
  return url;
}

// NOTE: sqlite path is used for local dev; Render Postgres uses DATABASE_URL.
// To keep SQL compatible across both, we use a light dialect mapping.

let sqlite;
let pool;

function toPgSafe(sql) {
  return sql
    .replace(/datetime\('now'\)/g, 'now()')
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
    .replace(/INTEGER NOT NULL DEFAULT 1/g, 'BOOLEAN NOT NULL DEFAULT true')
    .replace(/INTEGER NOT NULL DEFAULT 0/g, 'BOOLEAN NOT NULL DEFAULT false');
}

function toSqliteSafe(sql) {
  return sql
    .replace(/now\(\)/g, `datetime('now')`)
    .replace(/SERIAL PRIMARY KEY/g, 'INTEGER PRIMARY KEY AUTOINCREMENT')
    .replace(/BOOLEAN NOT NULL DEFAULT/g, 'INTEGER NOT NULL DEFAULT');
}

const isPg = !!DATABASE_URL;

async function init() {
  if (isPg) {
    pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 10 });
    await pool.query(toPgSafe(SCHEMA));
    for (const t of ['aws_profiles', 'instance_schedules', 'instance_auto_config']) {
      await pool.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS sb_ref TEXT`);
    }
  } else {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const dir = path.resolve(__dirname, '..', 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    sqlite = new DatabaseSync(path.join(dir, 'app.db'));
    sqlite.exec('PRAGMA journal_mode = WAL;');
    sqlite.exec('PRAGMA foreign_keys = ON;');
    sqlite.exec(toSqliteSafe(SCHEMA));
    // idempotent migrations for older local db files
    const migs = [
      ['instance_auto_config', 'shrunk_on'],
      ['aws_profiles', 'sb_ref'],
      ['instance_schedules', 'sb_ref'],
      ['instance_auto_config', 'sb_ref'],
    ];
    for (const [table, col] of migs) {
      try {
        const cols = sqlite.prepare(`PRAGMA table_info('${table}')`).all().map((c) => c.name);
        if (!cols.includes(col)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`);
      } catch { /* ignore */ }
    }
  }
  console.log(`[db] ${isPg ? 'Postgres (Render)' : 'SQLite (local)'} ready`);
}

const db = {
  async query(text, params = []) {
    if (isPg) {
      let i = 1;
      const pgText = text.replace(/\?/g, () => `$${i++}`);
      const r = await pool.query(pgText, params);
      return r.rows;
    }
    const bound = params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
    const stmt = sqlite.prepare(text);
    if (/^\s*select/i.test(text)) {
      return stmt.all(...bound);
    }
    stmt.run(...bound);
    return [];
  },
  async one(text, params = []) {
    const rows = await this.query(text, params);
    return rows[0] || null;
  },
  async run(text, params = []) {
    const r = await this.query(text, params);
    return r;
  },
};

await init();
export default db;