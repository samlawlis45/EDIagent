const requestCounts = new Map();
const statusCounts = new Map();
let requestTotal = 0;
let requestErrors = 0;
let latencyTotalMs = 0;

function bucketPath(path) {
  if (path.startsWith('/v1/agent-core/workflows/runs/')) return '/v1/agent-core/workflows/runs/:id';
  if (path.startsWith('/v1/agent-core/webhooks/')) return '/v1/agent-core/webhooks/:id';
  return path;
}

function increment(counter, key) {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

export function recordRequest({ method, path, statusCode, durationMs }) {
  const key = `${method.toUpperCase()} ${bucketPath(path)}`;
  increment(requestCounts, key);
  increment(statusCounts, String(statusCode));
  requestTotal += 1;
  latencyTotalMs += Math.max(durationMs, 0);
  if (statusCode >= 400) requestErrors += 1;
}

export function getMetricsSnapshot() {
  const avgLatencyMs = requestTotal > 0 ? Number((latencyTotalMs / requestTotal).toFixed(2)) : 0;
  return {
    service: 'agent-core',
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      memoryRssBytes: process.memoryUsage().rss
    },
    http: {
      requestTotal,
      requestErrors,
      averageLatencyMs: avgLatencyMs,
      requestCounts: Object.fromEntries(requestCounts.entries()),
      statusCounts: Object.fromEntries(statusCounts.entries())
    }
  };
}
