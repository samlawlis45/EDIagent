import crypto from 'node:crypto';
import { getDb } from './db.js';

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function listWebhooks(tenantId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, tenant_id, url, secret, events_json, active, created_at
    FROM webhook_subscriptions
    WHERE tenant_id = ?
    ORDER BY created_at DESC
  `).all(tenantId);

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    url: row.url,
    secret: row.secret,
    events: parseJson(row.events_json, []),
    active: row.active === 1,
    createdAt: row.created_at
  }));
}

export function createWebhook({ tenantId, url, secret, events = [] }) {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO webhook_subscriptions
      (id, tenant_id, url, secret, events_json, active, created_at)
    VALUES
      (?, ?, ?, ?, ?, 1, ?)
  `).run(
    id,
    tenantId,
    url,
    secret ?? null,
    JSON.stringify(events),
    nowIso()
  );

  return id;
}

export function getActiveWebhooksForEvent(tenantId, eventType) {
  return listWebhooks(tenantId).filter((webhook) => {
    if (!webhook.active) return false;
    if (!webhook.events?.length) return true;
    return webhook.events.includes(eventType) || webhook.events.includes('*');
  });
}

