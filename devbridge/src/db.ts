import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname } from "path";

const DB_PATH = process.env.DB_PATH ?? "./devbridge.db";

function ensureDir(path: string) {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

ensureDir(DB_PATH);

export const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    local_path TEXT NOT NULL,
    repo_url TEXT,
    default_branch TEXT DEFAULT 'main',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS channel_context (
    channel_key TEXT PRIMARY KEY,
    selected_project_id INTEGER,
    opencode_session_id TEXT,
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (selected_project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_key TEXT NOT NULL,
    project_id INTEGER,
    mode TEXT NOT NULL,
    prompt TEXT,
    status TEXT NOT NULL,
    summary TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  );

  CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL,
    opencode_session_id TEXT NOT NULL,
    opencode_permission_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (run_id) REFERENCES runs(id)
  );

  CREATE INDEX IF NOT EXISTS idx_runs_channel ON runs(channel_key);
  CREATE INDEX IF NOT EXISTS idx_approvals_run ON approvals(run_id);
`);
