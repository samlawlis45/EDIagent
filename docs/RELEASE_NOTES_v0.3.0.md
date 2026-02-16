# Release Notes: v0.3.0

## Highlights

1. Auth and tenant isolation for all v1 endpoints.
2. Ops console support via workflow run history + resume APIs.
3. Webhooks and SSE event streaming for workflow events.
4. Hardened tool backend reliability (retry, timeout, circuit breaker, dead-letter).
5. Initial Cleo CIC connector backend for mapping/test tool operations.

## Added

- `src/auth/keys.js`
- `src/events/bus.js`
- `src/persistence/webhook-store.js`
- `src/tools/backends/cleo-cic-backend.js`
- `config/policy.default.json`
- `docs/MIGRATION_v0.3.0.md`

## Changed

- Tenant-scoped workflow persistence:
  - `workflow_runs`, `workflow_steps`, `workflow_events`
- Workflow execution is now fully async and policy-driven.
- Server endpoints enforce auth by default (except `/health`).
- Workflow run listing supports operational filters.
- Resume endpoint supports execution/retry overrides.

## Endpoints

New:

- `GET /v1/agent-core/auth/me`
- `POST /v1/agent-core/auth/keys`
- `GET /v1/agent-core/webhooks`
- `POST /v1/agent-core/webhooks`
- `POST /v1/agent-core/webhooks/{id}/test`
- `GET /v1/agent-core/events/stream`

Existing workflow endpoints remain available.

