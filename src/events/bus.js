import { createHmac } from 'node:crypto';
import {
  createWebhookDelivery,
  getActiveWebhooksForEvent,
  getWebhookById,
  listPendingWebhookDeliveries,
  markWebhookDeliveryResult
} from '../persistence/webhook-store.js';

const subscribers = new Set();
const webhookAttempts = Number(process.env.AGENT_CORE_WEBHOOK_MAX_ATTEMPTS ?? 5);
const webhookBackoffMs = Number(process.env.AGENT_CORE_WEBHOOK_BACKOFF_MS ?? 1000);
const workerIntervalMs = Number(process.env.AGENT_CORE_WEBHOOK_WORKER_INTERVAL_MS ?? 2000);
const deliveryTimeoutMs = Number(process.env.AGENT_CORE_WEBHOOK_TIMEOUT_MS ?? 8000);
let workerRunning = false;

export function subscribeSse(res, tenantId) {
  const entry = { res, tenantId };
  subscribers.add(entry);
  return () => {
    subscribers.delete(entry);
  };
}

function writeSse(res, eventType, payload) {
  res.write(`event: ${eventType}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function computeNextRetryAt(attempt) {
  const delayMs = webhookBackoffMs * Math.max(attempt, 1);
  return new Date(Date.now() + delayMs).toISOString();
}

async function dispatchWebhook(webhook, deliveryId, eventType, payload) {
  const headers = {
    'Content-Type': 'application/json',
    'X-AgentCore-Event': eventType,
    'X-AgentCore-Delivery-Id': deliveryId,
  };
  if (webhook.secret) {
    const signature = createHmac('sha256', webhook.secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    headers['X-AgentCore-Signature'] = signature;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), deliveryTimeoutMs);
  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeout);
    let body = null;
    try {
      body = await response.text();
    } catch {
      body = null;
    }
    return {
      ok: response.ok,
      statusCode: response.status,
      body
    };
  } catch (error) {
    clearTimeout(timeout);
    const message = error instanceof Error ? error.message : 'Webhook dispatch failed';
    return {
      ok: false,
      statusCode: null,
      body: null,
      error: message
    };
  }
}

async function processDelivery(delivery) {
  const webhook = getWebhookById(delivery.tenantId, delivery.webhookId);
  const nextAttempt = Number(delivery.attempt ?? 0) + 1;
  if (!webhook || !webhook.active) {
    markWebhookDeliveryResult({
      deliveryId: delivery.id,
      attempt: nextAttempt,
      status: 'failed',
      lastError: 'Webhook subscription missing or inactive',
      nextRetryAt: null
    });
    return;
  }

  const result = await dispatchWebhook(webhook, delivery.id, delivery.eventType, delivery.payload);
  if (result.ok) {
    markWebhookDeliveryResult({
      deliveryId: delivery.id,
      attempt: nextAttempt,
      status: 'delivered',
      responseStatus: result.statusCode,
      responseBody: result.body,
      lastError: null,
      nextRetryAt: null
    });
    return;
  }

  if (nextAttempt < webhookAttempts) {
    markWebhookDeliveryResult({
      deliveryId: delivery.id,
      attempt: nextAttempt,
      status: 'retrying',
      responseStatus: result.statusCode,
      responseBody: result.body,
      lastError: result.error ?? `Webhook delivery failed with status ${result.statusCode ?? 'unknown'}`,
      nextRetryAt: computeNextRetryAt(nextAttempt)
    });
    return;
  }

  markWebhookDeliveryResult({
    deliveryId: delivery.id,
    attempt: nextAttempt,
    status: 'failed',
    responseStatus: result.statusCode,
    responseBody: result.body,
    lastError: result.error ?? `Webhook delivery failed with status ${result.statusCode ?? 'unknown'}`,
    nextRetryAt: null
  });
}

async function processPendingWebhooks() {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const pending = listPendingWebhookDeliveries(100);
    for (const delivery of pending) {
      await processDelivery(delivery);
    }
  } finally {
    workerRunning = false;
  }
}

setInterval(() => {
  processPendingWebhooks().catch(() => {});
}, workerIntervalMs);

export function triggerWebhookWorker() {
  processPendingWebhooks().catch(() => {});
}

export function publishEvent(tenantId, eventType, payload) {
  for (const subscriber of subscribers) {
    if (subscriber.tenantId !== tenantId) continue;
    writeSse(subscriber.res, eventType, payload);
  }

  const webhooks = getActiveWebhooksForEvent(tenantId, eventType);
  for (const webhook of webhooks) {
    const deliveryId = createWebhookDelivery({
      tenantId,
      webhookId: webhook.id,
      eventType,
      payload
    });
    processDelivery({
      id: deliveryId,
      tenantId,
      webhookId: webhook.id,
      eventType,
      payload,
      attempt: 0,
      status: 'pending'
    }).catch(() => {});
  }
}
