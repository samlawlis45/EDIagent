import { createHmac } from 'node:crypto';

export async function callHttpJsonBackend(config, payload, reliability) {
  const url = config?.urlEnv ? process.env[config.urlEnv] : null;
  if (!url) {
    return {
      status: 'skipped',
      reason: `Missing endpoint env: ${config?.urlEnv ?? 'unknown'}`
    };
  }

  const headers = {
    'Content-Type': 'application/json'
  };
  if (config.authTokenEnv && process.env[config.authTokenEnv]) {
    headers.Authorization = `Bearer ${process.env[config.authTokenEnv]}`;
  }
  if (config.signatureSecretEnv && process.env[config.signatureSecretEnv]) {
    headers['X-AgentCore-Signature'] = createHmac('sha256', process.env[config.signatureSecretEnv])
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  const controller = new AbortController();
  const timeoutMs = reliability?.timeoutMs ?? 5000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  clearTimeout(timeout);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    return {
      status: 'failed',
      reason: `Backend call failed: ${response.status}`,
      response: body
    };
  }

  return {
    status: 'executed',
    response: body
  };
}
