# Migration Guide: v0.3.0

## Summary

v0.3.0 introduces:

1. API key authentication and tenant isolation
2. Webhook subscriptions and SSE event stream
3. Backend reliability controls (retry/timeout/circuit breaker/dead-letter)
4. Cleo CIC backend connector support

## Auth and Tenant Requirements

`/v1/*` endpoints now require:

- `x-tenant-id`
- `Authorization: Bearer <api-key>` (or `x-api-key`)

For first-time setup, define:

- `AGENT_CORE_BOOTSTRAP_API_KEY`
- `AGENT_CORE_BOOTSTRAP_TENANT_ID` (optional; default `default`)

If needed for local development only:

- `AGENT_CORE_REQUIRE_AUTH=false`

## Tenant-Scoped Data

Workflow runs, steps, and events are now tenant-scoped.
Queries and run access are restricted by tenant.

## New Endpoints

- `GET /v1/agent-core/auth/me`
- `POST /v1/agent-core/auth/keys`
- `GET /v1/agent-core/webhooks`
- `POST /v1/agent-core/webhooks`
- `POST /v1/agent-core/webhooks/{id}/test`
- `GET /v1/agent-core/events/stream`

## Tool Backend Reliability

Configured in `config/policy.default.json`:

- timeout
- retries/backoff
- circuit breaker
- dead-letter logging

## Cleo CIC Connector

Set env:

- `CLEO_CIC_BASE_URL`
- `CLEO_CIC_TOKEN`
- `CLEO_CIC_TENANT` (optional)

