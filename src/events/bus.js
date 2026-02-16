import crypto from 'node:crypto';
import { createHmac } from 'node:crypto';
import { getActiveWebhooksForEvent } from '../persistence/webhook-store.js';

const subscribers = new Set();

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

async function dispatchWebhook(webhook, eventType, payload) {
  const headers = {
    'Content-Type': 'application/json',
    'X-AgentCore-Event': eventType,
    'X-AgentCore-Delivery-Id': crypto.randomUUID(),
  };
  if (webhook.secret) {
    const signature = createHmac('sha256', webhook.secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    headers['X-AgentCore-Signature'] = signature;
  }

  try {
    await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort delivery in v0.2; failed attempts are not blocking.
  }
}

export function publishEvent(tenantId, eventType, payload) {
  for (const subscriber of subscribers) {
    if (subscriber.tenantId !== tenantId) continue;
    writeSse(subscriber.res, eventType, payload);
  }

  const webhooks = getActiveWebhooksForEvent(tenantId, eventType);
  for (const webhook of webhooks) {
    dispatchWebhook(webhook, eventType, payload).catch(() => {});
  }
}

