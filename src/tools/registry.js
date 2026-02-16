import { getToolAdapter } from './adapter-registry.js';
import { getToolBackendConfig, getToolReliabilityConfig } from '../policy/engine.js';
import { callHttpJsonBackend } from './backends/http-json-backend.js';
import { callCleoCicBackend } from './backends/cleo-cic-backend.js';
import { createToolDeadLetter } from '../persistence/workflow-store.js';

function pickFields(source, requiredInputs = []) {
  const payload = {};
  for (const key of requiredInputs) {
    if (source[key] !== undefined) payload[key] = source[key];
  }
  return payload;
}

const toolHandlers = {
  'project.plan.sync': ({ context, contract }) => ({
    synced: true,
    payload: pickFields(
      {
        projectId: context.workflowInput.projectId,
        milestones: context.workflowInput.program?.milestones ?? [],
        dependencies: context.workflowInput.program?.dependencies ?? []
      },
      contract.requiredInputs
    )
  }),
  'test.execution.run': ({ context, contract }) => ({
    queued: true,
    payload: pickFields(
      {
        projectId: context.workflowInput.projectId,
        documentType: context.workflowInput.documentType,
        suiteId: context.workflowInput.test?.suiteId ?? 'default-regression'
      },
      contract.requiredInputs
    )
  }),
  'certification.report.publish': ({ context, contract }) => ({
    published: true,
    payload: pickFields(
      {
        projectId: context.workflowInput.projectId,
        qualityScore: context.latestStepOutput?.qualityScore,
        certificationDecision: context.latestStepOutput?.certificationDecision,
        blockers: context.latestStepOutput?.blockers ?? []
      },
      contract.requiredInputs
    )
  }),
  'stakeholder.status.publish': ({ context, contract }) => ({
    published: true,
    payload: pickFields(
      {
        projectId: context.workflowInput.projectId,
        health: context.latestStepOutput?.health,
        criticalPathItems: context.latestStepOutput?.criticalPathItems ?? [],
        next30DayPlan: context.latestStepOutput?.next30DayPlan ?? []
      },
      contract.requiredInputs
    )
  })
};

const circuitState = new Map();

function isCircuitOpen(toolName, reliability) {
  const state = circuitState.get(toolName);
  if (!state) return false;
  if (state.failures < (reliability.circuitBreakerFailures ?? 5)) return false;
  const cooldown = reliability.circuitBreakerCooldownMs ?? 30000;
  return (Date.now() - state.lastFailureAt) < cooldown;
}

function markFailure(toolName) {
  const state = circuitState.get(toolName) ?? { failures: 0, lastFailureAt: 0 };
  state.failures += 1;
  state.lastFailureAt = Date.now();
  circuitState.set(toolName, state);
}

function markSuccess(toolName) {
  circuitState.set(toolName, { failures: 0, lastFailureAt: 0 });
}

async function sleep(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeToolWithBackend(tenantId, toolName, transformedPayload, reliability) {
  const backendConfig = getToolBackendConfig(tenantId, toolName);
  if (!backendConfig) {
    return {
      status: 'unsupported',
      reason: 'No backend configured in policy'
    };
  }

  if (isCircuitOpen(toolName, reliability)) {
    return {
      status: 'failed',
      reason: 'Circuit breaker open'
    };
  }

  const attempts = reliability.maxAttempts ?? 2;
  const backoff = reliability.backoffMs ?? 200;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let result;
    try {
      if (backendConfig.type === 'http_json') {
        result = await callHttpJsonBackend(backendConfig, transformedPayload, reliability);
      } else if (backendConfig.type === 'cleo_cic') {
        result = await callCleoCicBackend(backendConfig, transformedPayload, reliability);
      } else {
        result = {
          status: 'unsupported',
          reason: `Unsupported backend type: ${backendConfig.type}`
        };
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      result = {
        status: 'failed',
        reason
      };
    }

    if (result.status === 'executed' || result.status === 'skipped') {
      markSuccess(toolName);
      return {
        ...result,
        attempt
      };
    }

    markFailure(toolName);
    if (attempt < attempts) {
      await sleep(backoff * attempt);
    }
  }

  return {
    status: 'failed',
    reason: `Backend failed after ${attempts} attempts`
  };
}

export async function executeToolContracts(args) {
  const {
    adapterId,
    contracts = [],
    context,
    executeTools = false,
    enabledTools = [],
    tenantId = 'default',
    workflowRunId = null
  } = args;
  const adapter = getToolAdapter(adapterId);
  const reliability = getToolReliabilityConfig(tenantId);
  const allowAll = enabledTools.includes('*');
  const results = [];

  for (const contract of contracts) {
    const handler = toolHandlers[contract.tool];
    const enabled = allowAll || enabledTools.includes(contract.tool);

    if (!executeTools) {
      results.push({
        tool: contract.tool,
        status: 'dry_run',
        reason: 'Tool execution disabled'
      });
      continue;
    }

    if (!enabled) {
      results.push({
        tool: contract.tool,
        status: 'skipped',
        reason: 'Tool not enabled for this run'
      });
      continue;
    }

    if (!handler) {
      results.push({
        tool: contract.tool,
        status: 'unsupported',
        reason: 'No registered tool handler'
      });
      continue;
    }

    const output = handler({ context, contract });
    const transformed = adapter.transform(contract.tool, output);
    const backendResult = await executeToolWithBackend(tenantId, contract.tool, transformed, reliability);
    if (backendResult.status === 'failed') {
      createToolDeadLetter({
        tenantId,
        workflowRunId,
        toolName: contract.tool,
        payload: transformed,
        error: backendResult.reason ?? 'backend failure'
      });
    }
    results.push({
      tool: contract.tool,
      status: backendResult.status,
      output: transformed,
      backend: backendResult
    });
  }

  return results;
}
