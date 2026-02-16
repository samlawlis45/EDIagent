import crypto from 'node:crypto';
import { getDb } from '../persistence/db.js';

function nowIso() {
  return new Date().toISOString();
}

function hashKey(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function keyPrefix(raw) {
  return raw.slice(0, 12);
}

export function isAuthRequired() {
  return process.env.AGENT_CORE_REQUIRE_AUTH !== 'false';
}

function ensureTenant(tenantId, tenantName = tenantId) {
  const db = getDb();
  db.prepare(`
    INSERT INTO tenants (id, name, active, created_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(tenantId, tenantName, nowIso());
}

export function bootstrapAuthFromEnv() {
  const bootstrapKey = process.env.AGENT_CORE_BOOTSTRAP_API_KEY;
  if (!bootstrapKey) return;

  const tenantId = process.env.AGENT_CORE_BOOTSTRAP_TENANT_ID ?? 'default';
  const tenantName = process.env.AGENT_CORE_BOOTSTRAP_TENANT_NAME ?? 'Default Tenant';
  const keyName = process.env.AGENT_CORE_BOOTSTRAP_KEY_NAME ?? 'bootstrap';
  ensureTenant(tenantId, tenantName);

  const db = getDb();
  const prefix = keyPrefix(bootstrapKey);
  const existing = db.prepare(`
    SELECT id
    FROM tenant_api_keys
    WHERE tenant_id = ? AND key_prefix = ?
  `).get(tenantId, prefix);

  if (existing) return;

  db.prepare(`
    INSERT INTO tenant_api_keys
      (id, tenant_id, name, key_hash, key_prefix, scopes_json, active, created_at)
    VALUES
      (?, ?, ?, ?, ?, '["*"]', 1, ?)
  `).run(
    crypto.randomUUID(),
    tenantId,
    keyName,
    hashKey(bootstrapKey),
    prefix,
    nowIso()
  );
}

export function createTenantApiKey({ tenantId, tenantName, keyName, rawKey, scopes = ['*'] }) {
  ensureTenant(tenantId, tenantName ?? tenantId);
  const db = getDb();
  db.prepare(`
    INSERT INTO tenant_api_keys
      (id, tenant_id, name, key_hash, key_prefix, scopes_json, active, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(
    crypto.randomUUID(),
    tenantId,
    keyName,
    hashKey(rawKey),
    keyPrefix(rawKey),
    JSON.stringify(scopes),
    nowIso()
  );
}

export function authenticateRequest(headers) {
  if (!isAuthRequired()) {
    return {
      tenantId: headers['x-tenant-id'] ?? 'default',
      scopes: ['*'],
      keyName: 'auth-disabled'
    };
  }

  const authHeader = headers.authorization ?? '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const apiKey = headers['x-api-key'] ?? bearer;
  if (!apiKey) return null;

  const tenantId = headers['x-tenant-id'];
  if (!tenantId) return null;

  const db = getDb();
  const record = db.prepare(`
    SELECT name, key_hash, scopes_json, active
    FROM tenant_api_keys
    WHERE tenant_id = ? AND key_prefix = ?
    LIMIT 1
  `).get(tenantId, keyPrefix(apiKey));

  if (!record || record.active !== 1) return null;
  if (record.key_hash !== hashKey(apiKey)) return null;

  return {
    tenantId,
    scopes: JSON.parse(record.scopes_json ?? '[]'),
    keyName: record.name
  };
}

