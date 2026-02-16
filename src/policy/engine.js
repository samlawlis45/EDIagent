import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getDb } from '../persistence/db.js';

const defaultPolicyPath = path.resolve(process.cwd(), 'config', 'policy.default.json');

let cachedPolicy = null;
let cachedPolicyPath = null;

function readPolicy() {
  const configured = process.env.AGENT_CORE_POLICY_PATH;
  const policyPath = configured ? path.resolve(configured) : defaultPolicyPath;
  if (cachedPolicy && cachedPolicyPath === policyPath) return cachedPolicy;

  const raw = fs.readFileSync(policyPath, 'utf8');
  cachedPolicy = JSON.parse(raw);
  cachedPolicyPath = policyPath;
  return cachedPolicy;
}

function readTenantPolicy(tenantId) {
  const db = getDb();
  const row = db.prepare(`
    SELECT policy_json
    FROM tenant_policies
    WHERE tenant_id = ? AND active = 1
    ORDER BY version DESC
    LIMIT 1
  `).get(tenantId);
  if (!row?.policy_json) return null;
  try {
    return JSON.parse(row.policy_json);
  } catch {
    return null;
  }
}

function mergeExecutionDefaults(inputExecution = {}, policy) {
  const defaults = policy.executionDefaults ?? {};
  return {
    approvalMode: inputExecution.approvalMode ?? defaults.approvalMode ?? 'propose_only',
    executeTools: inputExecution.executeTools ?? defaults.executeTools ?? false,
    enabledTools: inputExecution.enabledTools ?? [],
    approvals: inputExecution.approvals ?? []
  };
}

export function getPolicy() {
  return readPolicy();
}

export function resolveExecutionConfig(workflowName, workflowInput) {
  const tenantId = workflowInput.tenantId ?? 'default';
  const policy = readTenantPolicy(tenantId) ?? readPolicy();
  const execution = mergeExecutionDefaults(workflowInput.execution ?? {}, policy);
  const workflowRules = policy.approvalRules?.[workflowName] ?? {};
  const retryPolicy = workflowInput.retryPolicy ?? policy.retryPolicy ?? { maxAttempts: 3, backoffMs: 250 };

  return {
    execution,
    workflowRules,
    retryPolicy,
    policy
  };
}

export function getToolBackendConfig(tenantId, toolName) {
  const policy = readTenantPolicy(tenantId) ?? readPolicy();
  return policy.toolExecution?.backends?.[toolName] ?? null;
}

export function getToolReliabilityConfig(tenantId = 'default') {
  const policy = readTenantPolicy(tenantId) ?? readPolicy();
  return policy.toolExecution?.reliability ?? {
    timeoutMs: 5000,
    maxAttempts: 2,
    backoffMs: 200,
    circuitBreakerFailures: 5,
    circuitBreakerCooldownMs: 30000
  };
}

export function getTenantPolicy(tenantId) {
  return readTenantPolicy(tenantId) ?? readPolicy();
}

export function listTenantPolicyVersions(tenantId) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, version, active, created_at
    FROM tenant_policies
    WHERE tenant_id = ?
    ORDER BY version DESC
  `).all(tenantId);

  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    active: row.active === 1,
    createdAt: row.created_at
  }));
}

export function upsertTenantPolicy(tenantId, policy) {
  const db = getDb();
  const current = db.prepare(`
    SELECT MAX(version) AS max_version
    FROM tenant_policies
    WHERE tenant_id = ?
  `).get(tenantId);
  const nextVersion = Number(current?.max_version ?? 0) + 1;
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE tenant_policies SET active = 0 WHERE tenant_id = ?`).run(tenantId);
    db.prepare(`
      INSERT INTO tenant_policies
        (id, tenant_id, version, policy_json, active, created_at)
      VALUES
        (?, ?, ?, ?, 1, ?)
    `).run(
      crypto.randomUUID(),
      tenantId,
      nextVersion,
      JSON.stringify(policy),
      now
    );
  });
  tx();

  return { version: nextVersion, createdAt: now };
}
