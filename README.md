# EDI Agent Core

Open-source, self-hosted runtime for EDI-focused agents that can run across different EDI products using adapters.

[![Release](https://img.shields.io/github/v/release/samlawlis45/EDIagent)](https://github.com/samlawlis45/EDIagent/releases)
[![License](https://img.shields.io/github/license/samlawlis45/EDIagent)](https://github.com/samlawlis45/EDIagent/blob/main/LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/samlawlis45/EDIagent/ci.yml?branch=main)](https://github.com/samlawlis45/EDIagent/actions/workflows/ci.yml)
[![Issues](https://img.shields.io/github/issues/samlawlis45/EDIagent)](https://github.com/samlawlis45/EDIagent/issues)

## Why

`agent-core` separates:

- `agent logic` (onboarding, spec, mapping, readiness)
- `adapter logic` (how each EDI stack payload is normalized)

This lets teams deploy the same agents in their own environment without forcing a single EDI platform.

## API

- `GET /health`
- `GET /v1/agent-core/capabilities`
- `POST /v1/agent-core/run`
- `GET /v1/agent-core/workflows/capabilities`
- `POST /v1/agent-core/workflows/run`
- `GET /v1/agent-core/workflows/runs`
- `GET /v1/agent-core/workflows/runs/{runId}`

## Included Agents

- `integration_program`
- `onboarding`
- `spec_analysis`
- `mapping_engineer`
- `test_certification`
- `deployment_readiness`
- `post_production_escalation`
- `standards_architecture`

## Included Adapters

- `canonical` (already normalized payloads)
- `acme_edi` (example product-specific adapter)

## Quick Start

```bash
cd services/agent-core
npm install
npm start
```

Default port is `4001` (override with `PORT`).

## Docker

```bash
cd services/agent-core
docker build -t ediagent-agent-core .
docker run --rm -p 4001:4001 ediagent-agent-core
```

## Integration with Existing App

If you are using the Next app in this monorepo, set:

```bash
AGENT_CORE_SERVICE_URL=http://localhost:4001
```

The app routes under `/api/v1/agent-core/*` will proxy to this standalone service.

## Example Request

```bash
curl -X POST http://localhost:4001/v1/agent-core/run \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "canonical",
    "agent": "deployment_readiness",
    "input": {
      "projectId": "proj-100",
      "environment": "production",
      "checklist": [
        {"name":"Partner certification passed","status":"complete","required":true},
        {"name":"Rollback plan approved","status":"in_progress","required":true}
      ],
      "approvals": [
        {"group":"Change Advisory Board","status":"pending","required":true}
      ]
    }
  }'
```

## Example Workflow Request

```bash
curl -X POST http://localhost:4001/v1/agent-core/workflows/run \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "canonical",
    "workflow": "new_partner_implementation",
    "input": {
      "projectId": "proj-100",
      "projectName": "Acme Implementation",
      "partnerName": "Acme Logistics",
      "partnerId": "partner-22",
      "connectionType": "SFTP",
      "sourceSchema": {"fields":[{"name":"invoice_total","type":"number"}]},
      "targetSchema": {"fields":[{"name":"invoice_total","type":"number","required":true}]},
      "execution": {
        "approvalMode": "execute",
        "executeTools": true,
        "enabledTools": ["project.plan.sync", "test.execution.run", "certification.report.publish", "stakeholder.status.publish"],
        "approvals": [
          {"scope":"workflow_execute","group":"CAB","status":"approved","required":true},
          {"scope":"deployment_execute","group":"Release","status":"approved","required":true}
        ]
      }
    }
  }'
```

## Workflow Persistence

Workflow runs, steps, and events are persisted in SQLite:

- Default path: `services/agent-core/data/agent-core.db`
- Override path with `AGENT_CORE_DB_PATH`

Use:

- `GET /v1/agent-core/workflows/runs?limit=50`
- `GET /v1/agent-core/workflows/runs/{runId}`

## Approval Gates and Tool Execution

Workflow execution supports:

- `approvalMode`: `propose_only` or `execute`
- `approvals` scoped to:
  - `workflow_execute`
  - `deployment_execute`
  - `post_production_escalation_execute`
- `executeTools` and `enabledTools` for controlled tool execution

When required approvals are missing in `execute` mode, workflow summary includes blocking reasons and returns a hold recommendation.


## Extending

- Add new agents in `src/agents/`
- Add new adapters in `src/adapters/`
- Follow `docs/ADAPTER_SDK.md` for adapter contract details

## Open Source Project Files

- `LICENSE` (Apache-2.0)
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `.github/workflows/ci.yml`
