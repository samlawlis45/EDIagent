import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const dbPath = process.env.AGENT_CORE_DB_PATH
  ? path.resolve(process.env.AGENT_CORE_DB_PATH)
  : path.resolve(process.cwd(), 'data', 'agent-core.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  workflow TEXT NOT NULL,
  adapter TEXT NOT NULL,
  project_id TEXT,
  partner_name TEXT,
  status TEXT NOT NULL,
  approval_mode TEXT NOT NULL,
  go_live_recommendation TEXT,
  blocking_reasons_json TEXT NOT NULL DEFAULT '[]',
  input_json TEXT NOT NULL,
  output_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  status TEXT NOT NULL,
  output_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT,
  FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs(id)
);

CREATE TABLE IF NOT EXISTS workflow_events (
  id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_at ON workflow_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_run_id ON workflow_steps(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_run_id ON workflow_events(workflow_run_id);
`);

export function getDb() {
  return db;
}

export function getDbPath() {
  return dbPath;
}

