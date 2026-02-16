#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Cleo staging smoke test for agent-core.

Required env:
  AGENT_CORE_BASE_URL       e.g. http://localhost:4001
  AGENT_CORE_TENANT_ID      e.g. default
  AGENT_CORE_API_KEY        tenant API key

Optional env:
  AGENT_CORE_WEBHOOK_ID     webhook id for /webhooks/{id}/test call

Example:
  AGENT_CORE_BASE_URL=http://localhost:4001 \\
  AGENT_CORE_TENANT_ID=default \\
  AGENT_CORE_API_KEY=... \\
  ./scripts/cleo-staging-smoke.sh
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "[ERROR] Missing required env: $key" >&2
    exit 1
  fi
}

require_env AGENT_CORE_BASE_URL
require_env AGENT_CORE_TENANT_ID
require_env AGENT_CORE_API_KEY

BASE_URL="${AGENT_CORE_BASE_URL%/}"
TENANT_ID="$AGENT_CORE_TENANT_ID"
API_KEY="$AGENT_CORE_API_KEY"

auth_headers=(
  -H "Authorization: Bearer ${API_KEY}"
  -H "x-api-key: ${API_KEY}"
  -H "x-tenant-id: ${TENANT_ID}"
)

echo "[1/6] Health"
HEALTH_RESP="$(curl -fsS "${BASE_URL}/health")"
echo "$HEALTH_RESP" | grep -q '"ok":true' || {
  echo "[ERROR] health check failed: $HEALTH_RESP" >&2
  exit 1
}

echo "[2/6] Auth"
AUTH_RESP="$(curl -fsS "${auth_headers[@]}" "${BASE_URL}/v1/agent-core/auth/me")"
echo "$AUTH_RESP" | grep -q "\"tenantId\":\"${TENANT_ID}\"" || {
  echo "[ERROR] auth tenant mismatch: $AUTH_RESP" >&2
  exit 1
}

echo "[3/6] Workflow capabilities"
curl -fsS "${auth_headers[@]}" "${BASE_URL}/v1/agent-core/workflows/capabilities" >/dev/null

echo "[4/6] Run workflow"
PAYLOAD_FILE="$(mktemp)"
cat >"$PAYLOAD_FILE" <<JSON
{
  "adapter": "canonical",
  "workflow": "new_partner_implementation",
  "input": {
    "projectId": "smoke-$(date +%s)",
    "projectName": "Cleo CIC Smoke",
    "partnerName": "Staging Partner",
    "partnerId": "staging-partner-01",
    "connectionType": "AS2",
    "targetDocumentTypes": ["850", "810"],
    "businessRules": [
      {"ruleId": "amount_non_negative", "description": "Invoice amount must be >= 0"}
    ],
    "sourceSchema": {"fields": [{"name": "invoice_total", "type": "number"}]},
    "targetSchema": {"fields": [{"name": "invoice_total", "type": "number", "required": true}]},
    "mappingIntent": [{"sourceField": "invoice_total", "targetField": "invoice_total"}],
    "documentType": "810",
    "test": {
      "suiteId": "default-regression",
      "results": [{"caseId": "T1", "status": "passed"}],
      "certificationCriteria": [{"name": "All tests pass", "required": true}],
      "defectSummary": {"openCritical": 0, "openMajor": 0},
      "partnerCertification": {"decision": "approved", "notes": "smoke"}
    },
    "deployment": {
      "environment": "staging",
      "checklist": [{"name": "Runbook approved", "status": "complete", "required": true}],
      "approvals": [{"group": "Release", "status": "approved", "required": true}]
    },
    "standards": {
      "artifacts": [{"name": "Mapping Spec", "status": "complete"}],
      "checklist": [{"ruleId": "std_001", "description": "Naming standard"}],
      "architectureDecisions": [{"title": "Use canonical mapper", "decision": "approved"}],
      "reuseTargets": ["base-810-map"]
    },
    "postProduction": {
      "enabled": false,
      "symptoms": [],
      "affectedPartners": [],
      "runbookSteps": [],
      "recentChanges": [],
      "metrics": []
    }
  }
}
JSON

RUN_RESP="$(curl -fsS -X POST "${auth_headers[@]}" -H "Content-Type: application/json" --data @"$PAYLOAD_FILE" "${BASE_URL}/v1/agent-core/workflows/run")"
RUN_ID="$(echo "$RUN_RESP" | sed -n 's/.*"runId":"\([^"]*\)".*/\1/p' | head -n1)"
if [[ -z "$RUN_ID" ]]; then
  echo "[ERROR] runId not found in response: $RUN_RESP" >&2
  exit 1
fi
echo "runId=$RUN_ID"

echo "[5/6] Fetch run detail"
RUN_DETAIL="$(curl -fsS "${auth_headers[@]}" "${BASE_URL}/v1/agent-core/workflows/runs/${RUN_ID}")"
echo "$RUN_DETAIL" | grep -q "\"id\":\"${RUN_ID}\"" || {
  echo "[ERROR] run detail not found for $RUN_ID" >&2
  exit 1
}

echo "[6/6] Optional webhook test"
if [[ -n "${AGENT_CORE_WEBHOOK_ID:-}" ]]; then
  curl -fsS -X POST "${auth_headers[@]}" "${BASE_URL}/v1/agent-core/webhooks/${AGENT_CORE_WEBHOOK_ID}/test" >/dev/null
  echo "Triggered webhook test for ${AGENT_CORE_WEBHOOK_ID}."
else
  echo "Skipped (set AGENT_CORE_WEBHOOK_ID to enable)."
fi

rm -f "$PAYLOAD_FILE"
echo "[PASS] Cleo staging smoke completed successfully."
