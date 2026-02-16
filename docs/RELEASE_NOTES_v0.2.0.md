# Release Notes: v0.2.0

## Highlights

1. Workflow persistence with full run/step/event history.
2. Resume and retry support for failed/blocked runs.
3. Policy-driven approval gates.
4. Real tool backend execution (`http_json`) with env-configured endpoints.
5. Filterable workflow run queries for operations.

## Added

- Persistence:
  - `src/persistence/db.js`
  - `src/persistence/workflow-store.js`
- Policy engine:
  - `src/policy/engine.js`
  - `config/policy.default.json`
- Tool backends:
  - `src/tools/backends/http-json-backend.js`
  - updated `src/tools/registry.js`
- Resume/retry APIs:
  - `POST /v1/agent-core/workflows/runs/{runId}/resume`
- Run history APIs:
  - `GET /v1/agent-core/workflows/runs`
  - `GET /v1/agent-core/workflows/runs/{runId}`

## Changed

- Workflow runner now supports:
  - retry policy (`maxAttempts`, `backoffMs`)
  - policy-based approval validation
  - async tool backend execution
- Package version moved to `0.2.0`.

## Compatibility

- Existing workflow requests remain valid.
- New fields are optional.
- See `docs/MIGRATION_v0.2.0.md` for upgrade details.

