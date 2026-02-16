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
  tenant_id TEXT NOT NULL DEFAULT 'default',
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
  tenant_id TEXT NOT NULL DEFAULT 'default',
  workflow_run_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  output_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error TEXT,
  FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs(id)
);

CREATE TABLE IF NOT EXISTS workflow_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default',
  workflow_run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(workflow_run_id) REFERENCES workflow_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_created_at ON workflow_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_run_id ON workflow_steps(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_run_id ON workflow_events(workflow_run_id);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_prefix ON tenant_api_keys(key_prefix);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events_json TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_webhooks_tenant ON webhook_subscriptions(tenant_id, active);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  webhook_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  response_status INTEGER,
  response_body TEXT,
  last_error TEXT,
  next_retry_at TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(tenant_id, status, next_retry_at);

CREATE TABLE IF NOT EXISTS tool_dead_letters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workflow_run_id TEXT,
  tool_name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  error TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenant_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  policy_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_policy_version ON tenant_policies(tenant_id, version);
CREATE INDEX IF NOT EXISTS idx_tenant_policy_active ON tenant_policies(tenant_id, active);
`);

function ensureColumn(tableName, columnName, ddl) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
  }
}

ensureColumn('workflow_steps', 'attempt', 'attempt INTEGER NOT NULL DEFAULT 1');
ensureColumn('workflow_runs', 'tenant_id', "tenant_id TEXT NOT NULL DEFAULT 'default'");
ensureColumn('workflow_steps', 'tenant_id', "tenant_id TEXT NOT NULL DEFAULT 'default'");
ensureColumn('workflow_events', 'tenant_id', "tenant_id TEXT NOT NULL DEFAULT 'default'");
ensureColumn('tenant_api_keys', 'role', "role TEXT NOT NULL DEFAULT 'viewer'");
db.exec(`CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant ON workflow_runs(tenant_id, created_at DESC)`);

export function getDb() {
  return db;
}

export function getDbPath() {
  return dbPath;
}
