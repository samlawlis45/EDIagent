import http from 'node:http';
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
  isAuthRequired
} from './auth/keys.js';
import { createWebhook, listWebhooks } from './persistence/webhook-store.js';
import { publishEvent, subscribeSse } from './events/bus.js';

const port = Number(process.env.PORT ?? 4001);
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES ?? 1_000_000);
bootstrapAuthFromEnv();

function json(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
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

function ensureAuth(req, res) {
  const headers = normalizeHeaders(req.headers);
  const auth = authenticateRequest(headers);
  if (!auth) {
    json(
      res,
      401,
      { error: 'Unauthorized. Provide x-tenant-id and Bearer/x-api-key credentials.' }
    );
    return null;
  }
  return auth;
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = parsedUrl.pathname;

  if (method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  if (method === 'GET' && path === '/health') {
    json(res, 200, {
      ok: true,
      service: 'agent-core',
      authRequired: isAuthRequired(),
      dbPath: getDbPath(),
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/capabilities') {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    json(res, 200, getAgentCoreCapabilities());
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/auth/me') {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    json(res, 200, { tenantId: auth.tenantId, scopes: auth.scopes, keyName: auth.keyName });
    return;
  }

  if (method === 'POST' && path === '/v1/agent-core/auth/keys') {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    if (!auth.scopes.includes('*')) {
      json(res, 403, { error: 'Forbidden: key management requires wildcard scope' });
      return;
    }
    try {
      const body = await readJsonBody(req);
      if (!body.rawKey || !body.tenantId || !body.keyName) {
        json(res, 400, { error: 'rawKey, tenantId, and keyName are required' });
        return;
      }
      createTenantApiKey({
        tenantId: String(body.tenantId),
        tenantName: body.tenantName ? String(body.tenantName) : String(body.tenantId),
        keyName: String(body.keyName),
        rawKey: String(body.rawKey),
        scopes: Array.isArray(body.scopes) ? body.scopes.map((s) => String(s)) : ['*']
      });
      json(res, 201, { created: true });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      json(res, 500, { error: message });
      return;
    }
  }

  if (method === 'GET' && path === '/v1/agent-core/workflows/capabilities') {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    json(res, 200, getWorkflowCapabilities());
    return;
  }

  if (method === 'POST' && path === '/v1/agent-core/run') {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    try {
      const rawBody = await readJsonBody(req);
      const payload = runAgentSchema.parse(rawBody);
      const result = runAgent(payload);
      json(res, 200, {
        adapter: payload.adapter,
        agent: payload.agent,
        result
      });
      return;
    } catch (error) {
      if (error instanceof ZodError) {
        json(res, 400, { error: 'Invalid request payload', details: error.issues });
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      json(res, 500, { error: message });
      return;
    }
  }

  if (method === 'POST' && path === '/v1/agent-core/workflows/run') {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    try {
      const rawBody = await readJsonBody(req);
      const payload = runWorkflowSchema.parse(rawBody);
      const result = await runWorkflow(payload, auth);
      json(res, 200, {
        adapter: payload.adapter,
        workflow: payload.workflow,
        result
      });
      return;
    } catch (error) {
      if (error instanceof ZodError) {
        json(res, 400, { error: 'Invalid request payload', details: error.issues });
        return;
      }

      const message = error instanceof Error ? error.message : 'Unknown error';
      json(res, 500, { error: message });
      return;
    }
  }

  if (method === 'GET' && path === '/v1/agent-core/workflows/runs') {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    const limit = Number(parsedUrl.searchParams.get('limit') ?? '50');
    const filters = {
      limit,
      status: parsedUrl.searchParams.get('status') ?? undefined,
      projectId: parsedUrl.searchParams.get('projectId') ?? undefined,
      from: parsedUrl.searchParams.get('from') ?? undefined,
      to: parsedUrl.searchParams.get('to') ?? undefined
    };
    json(res, 200, { runs: getWorkflowRuns(auth.tenantId, filters) });
    return;
  }

  if (method === 'POST' &&
      path.startsWith('/v1/agent-core/workflows/runs/') &&
      path.endsWith('/resume')) {
    const auth = ensureAuth(req, res);
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
      });
      return;
    } catch (error) {
      if (error instanceof ZodError) {
        json(res, 400, { error: 'Invalid resume payload', details: error.issues });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = message.includes('not found') ? 404 : 500;
      json(res, status, { error: message });
      return;
    }
  }

  if (method === 'GET' && path.startsWith('/v1/agent-core/workflows/runs/')) {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    const runId = path.replace('/v1/agent-core/workflows/runs/', '');
    const run = getWorkflowRun(auth.tenantId, runId);
    if (!run) {
      json(res, 404, { error: `Workflow run not found: ${runId}` });
      return;
    }
    json(res, 200, run);
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/webhooks') {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    json(res, 200, { webhooks: listWebhooks(auth.tenantId) });
    return;
  }

  if (method === 'POST' && path === '/v1/agent-core/webhooks') {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    try {
      const body = await readJsonBody(req);
      if (!body.url) {
        json(res, 400, { error: 'url is required' });
        return;
      }
      const id = createWebhook({
        tenantId: auth.tenantId,
        url: String(body.url),
        secret: body.secret ? String(body.secret) : null,
        events: Array.isArray(body.events) ? body.events.map((e) => String(e)) : ['*'],
      });
      json(res, 201, { id });
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      json(res, 500, { error: message });
      return;
    }
  }

  if (method === 'POST' &&
      path.startsWith('/v1/agent-core/webhooks/') &&
      path.endsWith('/test')) {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    const webhookId = path.replace('/v1/agent-core/webhooks/', '').replace('/test', '');
    publishEvent(auth.tenantId, 'webhook.test', {
      webhookId,
      tenantId: auth.tenantId,
      timestamp: new Date().toISOString()
    });
    json(res, 200, { delivered: true });
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/events/stream') {
    const auth = ensureAuth(req, res);
    if (!auth) return;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    const unsubscribe = subscribeSse(res, auth.tenantId);
    req.on('close', () => {
      unsubscribe();
    });
    return;
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(port, () => {
  console.log(`agent-core service listening on http://localhost:${port}`);
});
