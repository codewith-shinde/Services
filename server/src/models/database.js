const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const config = require("../config");

// Ensure data directory exists
const dbDir = path.dirname(path.resolve(config.DB_PATH));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.resolve(config.DB_PATH));

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema ────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    email_service_enabled INTEGER DEFAULT 0,
    punch_service_enabled INTEGER DEFAULT 1,
    gmail_email TEXT,
    gmail_app_password TEXT,
    shift_hours REAL DEFAULT 9.0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS punch_records (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date TEXT NOT NULL,
    punch_in TEXT,
    punch_out TEXT,
    expected_out TEXT,
    work_minutes INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    note TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_punch_user_date ON punch_records(user_id, date);

  CREATE TABLE IF NOT EXISTS emails_cache (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    message_id TEXT,
    subject TEXT,
    sender TEXT,
    date TEXT,
    snippet TEXT,
    body TEXT,
    is_unread INTEGER DEFAULT 1,
    importance TEXT DEFAULT 'MEDIUM',
    category TEXT DEFAULT 'fyi-info',
    fetched_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_emails_user ON emails_cache(user_id, date DESC);

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'todo',
    priority TEXT DEFAULT 'medium',
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
`);

module.exports = db;
