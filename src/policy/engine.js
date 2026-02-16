import fs from 'node:fs';
import path from 'node:path';

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
  const policy = readPolicy();
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

export function getToolBackendConfig(toolName) {
  const policy = readPolicy();
  return policy.toolExecution?.backends?.[toolName] ?? null;
}

