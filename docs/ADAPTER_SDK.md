# Adapter SDK

Adapters let `agent-core` run against any EDI product payload shape.

## Contract

Each adapter must expose:

```js
export const myAdapter = {
  id: 'my_adapter',
  name: 'My Adapter',
  normalizeDocument(document) {
    return {
      id: 'doc-id',
      type: 'invoice', // purchase_order | invoice | shipment_notice | unknown
      documentNumber: 'INV-123',
      lineItems: [],
      references: [],
      // optional: totalAmount, buyer, seller, sourceTrace, extensions
    };
  }
};
```

## Registration

Add adapter to `src/adapters/registry.js`:

```js
import { myAdapter } from './my-adapter.js';

const adapters = {
  ...,
  [myAdapter.id]: myAdapter
};
```

## Guidelines

- Preserve source traceability in `sourceTrace`
- Keep normalization deterministic
- Avoid side effects (no external writes in adapter logic)
- Store non-canonical fields under `extensions`

