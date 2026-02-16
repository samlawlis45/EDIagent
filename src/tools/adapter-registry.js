const defaultAdapter = {
  id: 'default',
  transform(toolName, payload) {
    return {
      toolName,
      payload
    };
  }
};

const passthroughAdapter = {
  id: 'canonical',
  transform(toolName, payload) {
    return {
      toolName,
      payload
    };
  }
};

const acmeAdapter = {
  id: 'acme_edi',
  transform(toolName, payload) {
    return {
      toolName,
      payload: {
        ...payload,
        source: 'acme_edi'
      }
    };
  }
};

const adapters = {
  canonical: passthroughAdapter,
  acme_edi: acmeAdapter
};

export function getToolAdapter(adapterId) {
  return adapters[adapterId] ?? defaultAdapter;
}

