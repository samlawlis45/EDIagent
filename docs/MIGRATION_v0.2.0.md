# Migration Guide: v0.2.0

## Summary

v0.2.0 introduces workflow persistence, resume/retry behavior, policy-driven approvals, and backend-driven tool execution.

## New Workflow Input Fields

`POST /v1/agent-core/workflows/run` input now supports:

- `execution.approvalMode` (`propose_only` | `execute`)
- `execution.executeTools` (boolean)
- `execution.enabledTools` (string[])
- `execution.approvals` (scoped approval list)
- `retryPolicy.maxAttempts`
- `retryPolicy.backoffMs`

All new fields are optional and have defaults.

## New Endpoints

- `GET /v1/agent-core/workflows/runs`
- `GET /v1/agent-core/workflows/runs/{runId}`
- `POST /v1/agent-core/workflows/runs/{runId}/resume`

## New Query Filters

`GET /v1/agent-core/workflows/runs` supports:

- `limit`
- `status`
- `projectId`
- `from` (ISO)
- `to` (ISO)

## Policy Configuration

Default policy file:

- `config/policy.default.json`

Override path via:

- `AGENT_CORE_POLICY_PATH`

## Database

SQLite DB is now required for workflow persistence.

- Default path: `data/agent-core.db`
- Override path: `AGENT_CORE_DB_PATH`

If upgrading from v0.1.x, the new schema is created automatically at startup.

