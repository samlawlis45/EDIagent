# Cleo CIC Staging Checklist

Use this checklist before onboarding live trading partners.

## 1) Environment and Auth

- [ ] `agent-core` service is running in staging.
- [ ] `AGENT_CORE_REQUIRE_AUTH=true`.
- [ ] Bootstrap key created for staging tenant.
- [ ] Staging tenant `admin`, `ops`, and `viewer` API keys created.
- [ ] Secrets are stored in your secret manager (not `.env` committed to git).

Required env vars:

- `AGENT_CORE_BOOTSTRAP_API_KEY`
- `AGENT_CORE_BOOTSTRAP_TENANT_ID`
- `CLEO_CIC_BASE_URL`
- `CLEO_CIC_TOKEN`
- `CLEO_CIC_TENANT` (optional)

## 2) Connectivity and Access

- [ ] `GET /health` returns `ok: true`.
- [ ] `GET /v1/agent-core/auth/me` works with staging key.
- [ ] Cleo token has permissions for mapping and test execution APIs.
- [ ] Outbound network route from staging to Cleo CIC is open.

## 3) Policy Setup

- [ ] Tenant policy saved in `PUT /v1/agent-core/policies`.
- [ ] Tool backend mapping includes Cleo operations:
  - `cleo.mapping.apply` -> `cleo_cic` / `apply_mapping`
  - `test.suite.execute` -> `cleo_cic` / `execute_test_suite`
- [ ] Reliability values reviewed (`timeoutMs`, retries, breaker thresholds).

## 4) Webhooks and Observability

- [ ] At least one webhook subscription created for workflow events.
- [ ] `GET /v1/agent-core/webhooks/deliveries` shows delivery lifecycle.
- [ ] `GET /v1/agent-core/metrics` is integrated in staging dashboards.
- [ ] Structured logs include request IDs and tenant IDs in your log pipeline.

## 5) Functional Smoke Test

Run the script:

```bash
cd services/agent-core
./scripts/cleo-staging-smoke.sh
```

Minimum pass criteria:

- [ ] Health check passes.
- [ ] Auth check returns expected tenant.
- [ ] Workflow run returns a `runId`.
- [ ] Run detail endpoint returns persisted steps/events.
- [ ] Optional webhook test event can be delivered and inspected.

## 6) Go/No-Go Criteria

Go to broader pilot only when:

- [ ] 10+ staging runs complete without service-level failures.
- [ ] No unresolved `failed` webhook deliveries for critical endpoints.
- [ ] Policy version locked and documented.
- [ ] Rollback plan documented (previous policy version + key rotation path).
