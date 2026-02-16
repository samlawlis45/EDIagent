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

const port = Number(process.env.PORT ?? 4001);
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES ?? 1_000_000);

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

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = parsedUrl.pathname;

  if (method === 'OPTIONS') {
    json(res, 204, {});
    return;
  }

  if (method === 'GET' && path === '/health') {
    json(res, 200, { ok: true, service: 'agent-core', dbPath: getDbPath(), timestamp: new Date().toISOString() });
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/capabilities') {
    json(res, 200, getAgentCoreCapabilities());
    return;
  }

  if (method === 'GET' && path === '/v1/agent-core/workflows/capabilities') {
    json(res, 200, getWorkflowCapabilities());
    return;
  }

  if (method === 'POST' && path === '/v1/agent-core/run') {
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
    try {
      const rawBody = await readJsonBody(req);
      const payload = runWorkflowSchema.parse(rawBody);
      const result = await runWorkflow(payload);
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
    const limit = Number(parsedUrl.searchParams.get('limit') ?? '50');
    const filters = {
      limit,
      status: parsedUrl.searchParams.get('status') ?? undefined,
      projectId: parsedUrl.searchParams.get('projectId') ?? undefined,
      from: parsedUrl.searchParams.get('from') ?? undefined,
      to: parsedUrl.searchParams.get('to') ?? undefined
    };
    json(res, 200, { runs: getWorkflowRuns(filters) });
    return;
  }

  if (method === 'POST' &&
      path.startsWith('/v1/agent-core/workflows/runs/') &&
      path.endsWith('/resume')) {
    const runId = path.replace('/v1/agent-core/workflows/runs/', '').replace('/resume', '');
    try {
      const rawBody = await readJsonBody(req);
      const override = resumeWorkflowSchema.parse(rawBody);
      const result = await resumeWorkflowRun(runId, override);
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
    const runId = path.replace('/v1/agent-core/workflows/runs/', '');
    const run = getWorkflowRun(runId);
    if (!run) {
      json(res, 404, { error: `Workflow run not found: ${runId}` });
      return;
    }
    json(res, 200, run);
    return;
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(port, () => {
  console.log(`agent-core service listening on http://localhost:${port}`);
});
