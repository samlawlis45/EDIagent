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

## Included Agents

- `integration_program`
- `onboarding`
- `invoice_anomaly`
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
