export async function callHttpJsonBackend(config, payload) {
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

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
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

