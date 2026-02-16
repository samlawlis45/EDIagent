function scoreChecklist(checklist = []) {
  if (!checklist.length) return 0;
  const passed = checklist.filter((item) => item.status === 'complete').length;
  return Math.round((passed / checklist.length) * 100);
}

function gatherBlockers(checklist = []) {
  return checklist
    .filter((item) => item.status !== 'complete' && item.required !== false)
    .map((item) => ({
      item: item.name,
      owner: item.owner ?? 'unassigned',
      status: item.status
    }));
}

export function runDeploymentReadinessAgent(input) {
  const readinessScore = scoreChecklist(input.checklist);
  const blockers = gatherBlockers(input.checklist);
  const requiredApprovals = (input.approvals ?? [])
    .filter((approval) => approval.required !== false)
    .map((approval) => ({
      group: approval.group,
      status: approval.status
    }));

  const unapproved = requiredApprovals.filter((approval) => approval.status !== 'approved');
  const releaseDecision = blockers.length || unapproved.length ? 'hold' : 'ready';

  const toolContracts = [
    {
      tool: 'change.ticket.validate',
      purpose: 'Validate that change-management requirements are met for production release',
      requiredInputs: ['changeTicketId', 'riskLevel', 'rollbackPlan']
    },
    {
      tool: 'deploy.window.reserve',
      purpose: 'Reserve approved deployment window and notify stakeholders',
      requiredInputs: ['projectId', 'windowStart', 'windowEnd', 'stakeholders']
    },
    {
      tool: 'monitoring.guard.enable',
      purpose: 'Enable post-deploy monitoring and rollback guardrails',
      requiredInputs: ['projectId', 'metricThresholds', 'onCallGroup']
    }
  ];

  return {
    projectId: input.projectId,
    environment: input.environment,
    readinessScore,
    releaseDecision,
    blockers,
    requiredApprovals,
    deploymentChecklistSummary: {
      totalItems: input.checklist?.length ?? 0,
      completedItems: input.checklist?.filter((item) => item.status === 'complete').length ?? 0
    },
    nextActions: releaseDecision === 'ready'
      ? ['Proceed with deployment management runbook execution']
      : [
          'Resolve all required checklist blockers',
          'Obtain outstanding required approvals',
          'Re-run deployment readiness assessment'
        ],
    toolContracts
  };
}

