import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { ZodError } from 'zod';
import { getAgentCoreCapabilities, runAgent } from './engine.js';
import { runAgentSchema } from './schemas.js';
import {
  getWorkflowCapabilities,
  getWorkflowRun,
  getWorkflowRuns,
  resumeWorkflowRun,
  runWorkflow
} from './workflows/engine.js';
import { resumeWorkflowSchema, runWorkflowSchema } from './workflows/schemas.js';
import { getDbPath } from './persistence/db.js';
import {
  authenticateRequest,
  bootstrapAuthFromEnv,
  createTenantApiKey,
  hasRole,
  isAuthRequired
} from './auth/keys.js';
import {
  cloneWebhookDeliveryForRetry,
  createWebhook,
  getWebhookDeliveryById,
  queryWebhookDeliveries,
  listWebhooks
} from './persistence/webhook-store.js';
import { publishEvent, subscribeSse, triggerWebhookWorker } from './events/bus.js';
import {
  getTenantPolicy,
  listTenantPolicyVersions,
  upsertTenantPolicy
} from './policy/engine.js';
import { logError, logInfo } from './observability/logger.js';
import { getMetricsSnapshot, recordRequest } from './observability/metrics.js';

const port = Number(process.env.PORT ?? 4001);
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES ?? 1_000_000);
bootstrapAuthFromEnv();

function json(res, statusCode, body, requestId) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-tenant-id,x-api-key,x-request-id',
    'x-request-id': requestId
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBodyBytes) {
        reject(new Error(`Request body too large. Max bytes: ${maxBodyBytes}`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', reject);
  });
}

function normalizeHeaders(rawHeaders) {
  const headers = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (Array.isArray(value)) {
      headers[key.toLowerCase()] = value[0];
    } else if (value != null) {
      headers[key.toLowerCase()] = value;
    }
  }
  return headers;
}

function ensureAuth(req, res, requestId) {
  const headers = normalizeHeaders(req.headers);
  const auth = authenticateRequest(headers);
  if (!auth) {
    json(
      res,
      401,
      { error: 'Unauthorized. Provide x-tenant-id and Bearer/x-api-key credentials.' },
      requestId
    );
    return null;
  }
  return auth;
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = parsedUrl.pathname;
  const start = Date.now();
  const requestId = String(req.headers['x-request-id'] ?? crypto.randomUUID());

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    recordRequest({
      method,
      path,
      statusCode: res.statusCode,
      durationMs
    });
    logInfo('http_request', {
      requestId,
      method,
      path,
      statusCode: res.statusCode,
      durationMs
    });
  });

  if (method === 'OPTIONS') {
    json(res, 204, {}, requestId);
    return;
  }

  if (method === 'GET' && path === '/health') {
    json(res, 200, {
      ok: true,
      service: 'agent-core',
      authRequired: isAuthRequired(),
      dbPath: getDbPath(),
      timestamp: new Date().toISOString()
    }, requestId);
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/capabilities') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    json(res, 200, getAgentCoreCapabilities(), requestId);
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/auth/me') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    json(res, 200, {
      tenantId: auth.tenantId,
      role: auth.role,
      scopes: auth.scopes,
      keyName: auth.keyName
    }, requestId);
    return;
  }

  if (method === 'POST' && path === '/v1/agent-core/auth/keys') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    if (!hasRole(auth, 'admin') || !auth.scopes.includes('*')) {
      json(res, 403, { error: 'Forbidden: key management requires admin role and wildcard scope' }, requestId);
      return;
    }
    try {
      const body = await readJsonBody(req);
      if (!body.rawKey || !body.tenantId || !body.keyName) {
        json(res, 400, { error: 'rawKey, tenantId, and keyName are required' }, requestId);
        return;
      }
      createTenantApiKey({
        tenantId: String(body.tenantId),
        tenantName: body.tenantName ? String(body.tenantName) : String(body.tenantId),
        keyName: String(body.keyName),
        rawKey: String(body.rawKey),
        role: body.role ? String(body.role) : 'viewer',
        scopes: Array.isArray(body.scopes) ? body.scopes.map((s) => String(s)) : ['*']
      });
      json(res, 201, { created: true }, requestId);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logError('auth_key_create_failed', { requestId, message });
      json(res, 500, { error: message }, requestId);
      return;
    }
  }

  if (method === 'GET' && path === '/v1/agent-core/workflows/capabilities') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    json(res, 200, getWorkflowCapabilities(), requestId);
    return;
  }

  if (method === 'POST' && path === '/v1/agent-core/run') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    try {
      const rawBody = await readJsonBody(req);
      const payload = runAgentSchema.parse(rawBody);
      const result = runAgent(payload);
      json(res, 200, {
        adapter: payload.adapter,
        agent: payload.agent,
        result
      }, requestId);
      return;
    } catch (error) {
      if (error instanceof ZodError) {
        json(res, 400, { error: 'Invalid request payload', details: error.issues }, requestId);
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      logError('agent_run_failed', { requestId, message });
      json(res, 500, { error: message }, requestId);
      return;
    }
  }

  if (method === 'POST' && path === '/v1/agent-core/workflows/run') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    try {
      const rawBody = await readJsonBody(req);
      const payload = runWorkflowSchema.parse(rawBody);
      const result = await runWorkflow(payload, auth);
      json(res, 200, {
        adapter: payload.adapter,
        workflow: payload.workflow,
        result
      }, requestId);
      return;
    } catch (error) {
      if (error instanceof ZodError) {
        json(res, 400, { error: 'Invalid request payload', details: error.issues }, requestId);
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      logError('workflow_run_failed', { requestId, message });
      json(res, 500, { error: message }, requestId);
      return;
    }
  }

  if (method === 'GET' && path === '/v1/agent-core/workflows/runs') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    const limit = Number(parsedUrl.searchParams.get('limit') ?? '50');
    const filters = {
      limit,
      status: parsedUrl.searchParams.get('status') ?? undefined,
      projectId: parsedUrl.searchParams.get('projectId') ?? undefined,
      from: parsedUrl.searchParams.get('from') ?? undefined,
      to: parsedUrl.searchParams.get('to') ?? undefined
    };
    json(res, 200, { runs: getWorkflowRuns(auth.tenantId, filters) }, requestId);
    return;
  }

  if (method === 'POST' &&
      path.startsWith('/v1/agent-core/workflows/runs/') &&
      path.endsWith('/resume')) {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    const runId = path.replace('/v1/agent-core/workflows/runs/', '').replace('/resume', '');
    try {
      const rawBody = await readJsonBody(req);
      const override = resumeWorkflowSchema.parse(rawBody);
      const result = await resumeWorkflowRun(auth.tenantId, runId, override);
      json(res, 200, {
        runId,
        resumed: true,
        result
      }, requestId);
      return;
    } catch (error) {
      if (error instanceof ZodError) {
        json(res, 400, { error: 'Invalid resume payload', details: error.issues }, requestId);
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = message.includes('not found') ? 404 : 500;
      json(res, status, { error: message }, requestId);
      return;
    }
  }

  if (method === 'GET' && path.startsWith('/v1/agent-core/workflows/runs/')) {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    const runId = path.replace('/v1/agent-core/workflows/runs/', '');
    const run = getWorkflowRun(auth.tenantId, runId);
    if (!run) {
      json(res, 404, { error: `Workflow run not found: ${runId}` }, requestId);
      return;
    }
    json(res, 200, run, requestId);
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/webhooks') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    json(res, 200, { webhooks: listWebhooks(auth.tenantId) }, requestId);
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/webhooks/deliveries') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    const requestedLimit = Number(parsedUrl.searchParams.get('limit') ?? '25');
    const requestedPage = Number(parsedUrl.searchParams.get('page') ?? '1');
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 25, 1), 500);
    const page = Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1);
    const offset = Math.max((page - 1) * limit, 0);
    const status = parsedUrl.searchParams.get('status') ?? undefined;
    const eventType = parsedUrl.searchParams.get('eventType') ?? undefined;
    const query = parsedUrl.searchParams.get('query') ?? undefined;
    const sortBy = parsedUrl.searchParams.get('sortBy') ?? 'createdAt';
    const sortOrder = parsedUrl.searchParams.get('sortOrder') ?? 'desc';

    const result = queryWebhookDeliveries(auth.tenantId, {
      limit,
      offset,
      status,
      eventType,
      query,
      sortBy,
      sortOrder
    });
    json(res, 200, {
      deliveries: result.deliveries,
      pagination: {
        page: Math.max(page, 1),
        limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / Math.max(limit, 1)))
      },
      sort: {
        sortBy,
        sortOrder
      }
    }, requestId);
    return;
  }

  if (method === 'GET' &&
      path.startsWith('/v1/agent-core/webhooks/deliveries/')) {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    const deliveryId = path.replace('/v1/agent-core/webhooks/deliveries/', '');
    const delivery = getWebhookDeliveryById(auth.tenantId, deliveryId);
    if (!delivery) {
      json(res, 404, { error: `Webhook delivery not found: ${deliveryId}` }, requestId);
      return;
    }
    json(res, 200, { delivery }, requestId);
    return;
  }

  if (method === 'POST' &&
      path.startsWith('/v1/agent-core/webhooks/deliveries/') &&
      path.endsWith('/retry')) {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    if (!hasRole(auth, 'ops')) {
      json(res, 403, { error: 'Forbidden: ops role required to retry deliveries' }, requestId);
      return;
    }
    const deliveryId = path
      .replace('/v1/agent-core/webhooks/deliveries/', '')
      .replace('/retry', '');
    const retryDeliveryId = cloneWebhookDeliveryForRetry(auth.tenantId, deliveryId);
    if (!retryDeliveryId) {
      json(res, 404, { error: `Webhook delivery not found: ${deliveryId}` }, requestId);
      return;
    }
    triggerWebhookWorker();
    json(res, 202, { queued: true, retryDeliveryId }, requestId);
    return;
  }

  if (method === 'POST' && path === '/v1/agent-core/webhooks') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    if (!hasRole(auth, 'ops')) {
      json(res, 403, { error: 'Forbidden: ops role required to create webhooks' }, requestId);
      return;
    }
    try {
      const body = await readJsonBody(req);
      if (!body.url) {
        json(res, 400, { error: 'url is required' }, requestId);
        return;
      }
      const id = createWebhook({
        tenantId: auth.tenantId,
        url: String(body.url),
        secret: body.secret ? String(body.secret) : null,
        events: Array.isArray(body.events) ? body.events.map((e) => String(e)) : ['*'],
      });
      json(res, 201, { id }, requestId);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logError('webhook_create_failed', { requestId, message });
      json(res, 500, { error: message }, requestId);
      return;
    }
  }

  if (method === 'POST' &&
      path.startsWith('/v1/agent-core/webhooks/') &&
      path.endsWith('/test')) {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    const webhookId = path.replace('/v1/agent-core/webhooks/', '').replace('/test', '');
    publishEvent(auth.tenantId, 'webhook.test', {
      webhookId,
      tenantId: auth.tenantId,
      timestamp: new Date().toISOString()
    });
    json(res, 200, { delivered: true }, requestId);
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/events/stream') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'x-request-id': requestId
    });
    res.write(': connected\n\n');
    const unsubscribe = subscribeSse(res, auth.tenantId);
    req.on('close', () => {
      unsubscribe();
    });
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/policies') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    const includeVersions = parsedUrl.searchParams.get('versions') === 'true';
    const payload = {
      policy: getTenantPolicy(auth.tenantId)
    };
    if (includeVersions) {
      payload.versions = listTenantPolicyVersions(auth.tenantId);
    }
    json(res, 200, payload, requestId);
    return;
  }

  if (method === 'PUT' && path === '/v1/agent-core/policies') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    if (!hasRole(auth, 'admin')) {
      json(res, 403, { error: 'Forbidden: admin role required to update policy' }, requestId);
      return;
    }
    try {
      const body = await readJsonBody(req);
      const policy = body.policy ?? body;
      if (!policy || typeof policy !== 'object') {
        json(res, 400, { error: 'policy object is required' }, requestId);
        return;
      }
      const version = upsertTenantPolicy(auth.tenantId, policy);
      json(res, 200, { updated: true, ...version }, requestId);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logError('policy_update_failed', { requestId, message });
      json(res, 500, { error: message }, requestId);
      return;
    }
  }

  if (method === 'GET' && path === '/v1/agent-core/metrics') {
    const auth = ensureAuth(req, res, requestId);
    if (!auth) return;
    if (!hasRole(auth, 'ops')) {
      json(res, 403, { error: 'Forbidden: ops role required for metrics' }, requestId);
      return;
    }
    json(res, 200, getMetricsSnapshot(), requestId);
    return;
  }

  json(res, 404, { error: 'Not found' }, requestId);
});

server.listen(port, () => {
  console.log(`agent-core service listening on http://localhost:${port}`);
});
