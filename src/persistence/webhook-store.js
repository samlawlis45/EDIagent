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

export function createWebhookDelivery({
  tenantId,
  webhookId,
  eventType,
  payload,
  nextRetryAt = null,
}) {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO webhook_deliveries
      (id, tenant_id, webhook_id, event_type, payload_json, attempt, status, next_retry_at, created_at)
    VALUES
      (?, ?, ?, ?, ?, 0, 'pending', ?, ?)
  `).run(
    id,
    tenantId,
    webhookId,
    eventType,
    JSON.stringify(payload),
    nextRetryAt,
    nowIso()
  );
  return id;
}

export function markWebhookDeliveryResult({
  deliveryId,
  attempt,
  status,
  responseStatus = null,
  responseBody = null,
  lastError = null,
  nextRetryAt = null,
}) {
  const db = getDb();
  db.prepare(`
    UPDATE webhook_deliveries
    SET attempt = ?,
        status = ?,
        response_status = ?,
        response_body = ?,
        last_error = ?,
        next_retry_at = ?,
        delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END
    WHERE id = ?
  `).run(
    attempt,
    status,
    responseStatus,
    responseBody,
    lastError,
    nextRetryAt,
    status,
    nowIso(),
    deliveryId
  );
}

function mapDeliveryRow(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    webhookId: row.webhook_id,
    eventType: row.event_type,
    attempt: row.attempt,
    status: row.status,
    responseStatus: row.response_status,
    responseBody: row.response_body,
    lastError: row.last_error,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at
  };
}

export function queryWebhookDeliveries(tenantId, options = {}) {
  const {
    limit = 100,
    offset = 0,
    status,
    eventType,
    query,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = options;
  const db = getDb();
  const where = ['tenant_id = ?'];
  const params = [tenantId];

  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (eventType) {
    where.push('event_type = ?');
    params.push(eventType);
  }
  if (query) {
    where.push('(id LIKE ? OR webhook_id LIKE ? OR event_type LIKE ?)');
    const like = `%${query}%`;
    params.push(like, like, like);
  }

  const whereClause = `WHERE ${where.join(' AND ')}`;
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const sortColumnMap = {
    createdAt: 'created_at',
    status: 'status',
    eventType: 'event_type',
    attempt: 'attempt',
    deliveredAt: 'delivered_at',
    responseStatus: 'response_status'
  };
  const safeSortColumn = sortColumnMap[sortBy] ?? 'created_at';
  const safeSortOrder = String(sortOrder).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const totalRow = db.prepare(`
    SELECT COUNT(*) AS total
    FROM webhook_deliveries
    ${whereClause}
  `).get(...params);

  const rows = db.prepare(`
    SELECT *
    FROM webhook_deliveries
    ${whereClause}
    ORDER BY ${safeSortColumn} ${safeSortOrder}, created_at DESC
    LIMIT ?
    OFFSET ?
  `).all(...params, safeLimit, safeOffset);

  return {
    total: Number(totalRow?.total ?? 0),
    deliveries: rows.map(mapDeliveryRow)
  };
}

export function listWebhookDeliveries(tenantId, limit = 100) {
  return queryWebhookDeliveries(tenantId, { limit }).deliveries;
}

export function getWebhookDeliveryById(tenantId, deliveryId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT *
    FROM webhook_deliveries
    WHERE tenant_id = ? AND id = ?
    LIMIT 1
  `).get(tenantId, deliveryId);
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    webhookId: row.webhook_id,
    eventType: row.event_type,
    payload: parseJson(row.payload_json, {}),
    attempt: row.attempt,
    status: row.status,
    responseStatus: row.response_status,
    responseBody: row.response_body,
    lastError: row.last_error,
    nextRetryAt: row.next_retry_at,
    createdAt: row.created_at,
    deliveredAt: row.delivered_at
  };
}

export function cloneWebhookDeliveryForRetry(tenantId, deliveryId) {
  const delivery = getWebhookDeliveryById(tenantId, deliveryId);
  if (!delivery) return null;
  return createWebhookDelivery({
    tenantId,
    webhookId: delivery.webhookId,
    eventType: delivery.eventType,
    payload: delivery.payload
  });
}

export function listPendingWebhookDeliveries(limit = 100) {
  const db = getDb();
  const now = nowIso();
  const rows = db.prepare(`
    SELECT id, tenant_id, webhook_id, event_type, payload_json, attempt, status
    FROM webhook_deliveries
    WHERE status IN ('pending', 'retrying')
      AND (next_retry_at IS NULL OR next_retry_at <= ?)
    ORDER BY created_at ASC
    LIMIT ?
  `).all(now, Math.min(Math.max(limit, 1), 500));

  return rows.map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    webhookId: row.webhook_id,
    eventType: row.event_type,
    payload: parseJson(row.payload_json, {}),
    attempt: row.attempt,
    status: row.status
  }));
}

export function getWebhookById(tenantId, webhookId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, tenant_id, url, secret, events_json, active, created_at
    FROM webhook_subscriptions
    WHERE tenant_id = ? AND id = ?
    LIMIT 1
  `).get(tenantId, webhookId);
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    url: row.url,
    secret: row.secret,
    events: parseJson(row.events_json, []),
    active: row.active === 1,
    createdAt: row.created_at
  };
}
