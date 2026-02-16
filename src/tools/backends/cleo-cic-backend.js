function mapOperationPath(operation) {
  if (operation === 'apply_mapping') return '/api/v1/mappings/apply';
  if (operation === 'execute_test_suite') return '/api/v1/tests/execute';
  return '/api/v1/tools/execute';
}

export async function callCleoCicBackend(config, payload) {
  const baseUrl = process.env.CLEO_CIC_BASE_URL;
  const token = process.env.CLEO_CIC_TOKEN;
  const tenant = process.env.CLEO_CIC_TENANT;

  if (!baseUrl || !token) {
    return {
      status: 'skipped',
      reason: 'Missing CLEO_CIC_BASE_URL or CLEO_CIC_TOKEN'
    };
  }

  const endpoint = `${baseUrl.replace(/\/$/, '')}${mapOperationPath(config.operation)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(tenant ? { 'X-CIC-Tenant': tenant } : {})
    },
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
      reason: `Cleo CIC call failed: ${response.status}`,
      response: body
    };
  }

  return {
    status: 'executed',
    response: body
  };
}

