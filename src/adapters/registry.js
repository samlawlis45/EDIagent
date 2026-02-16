import { acmeEdiAdapter } from './acme-edi-adapter.js';
import { canonicalAdapter } from './canonical-adapter.js';

const adapters = {
  [canonicalAdapter.id]: canonicalAdapter,
  [acmeEdiAdapter.id]: acmeEdiAdapter
};

export function getAdapter(adapterId) {
  const adapter = adapters[adapterId];
  if (!adapter) {
    throw new Error(`Unknown adapter "${adapterId}". Available: ${Object.keys(adapters).join(', ')}`);
  }
  return adapter;
}

export function listAdapters() {
  return Object.values(adapters).map((adapter) => ({
    id: adapter.id,
    name: adapter.name
  }));
}

