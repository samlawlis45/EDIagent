import { getToolAdapter } from './adapter-registry.js';

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

export function executeToolContracts(args) {
  const {
    adapterId,
    contracts = [],
    context,
    executeTools = false,
    enabledTools = []
  } = args;
  const adapter = getToolAdapter(adapterId);
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
    results.push({
      tool: contract.tool,
      status: 'executed',
      output: adapter.transform(contract.tool, output)
    });
  }

  return results;
}

