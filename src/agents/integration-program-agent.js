function evaluateScheduleHealth(milestones = []) {
  const total = milestones.length;
  const complete = milestones.filter((m) => m.status === 'complete').length;
  const blocked = milestones.filter((m) => m.status === 'blocked').length;
  const completionPct = total ? Math.round((complete / total) * 100) : 0;

  if (blocked > 0) return { health: 'red', completionPct };
  if (completionPct < 60) return { health: 'yellow', completionPct };
  return { health: 'green', completionPct };
}

export function runIntegrationProgramAgent(input) {
  const schedule = evaluateScheduleHealth(input.milestones);
  const activeRisks = (input.risks ?? []).filter((risk) => risk.status !== 'closed');
  const blockedDependencies = (input.dependencies ?? []).filter((dep) => dep.status === 'blocked');
  const escalationNeeded = activeRisks.some((risk) => risk.severity === 'high') || blockedDependencies.length > 0;

  const criticalPathItems = [
    ...(input.milestones ?? [])
      .filter((m) => m.status !== 'complete')
      .map((m) => ({ type: 'milestone', name: m.name, owner: m.owner ?? 'unassigned' })),
    ...blockedDependencies.map((dep) => ({ type: 'dependency', name: dep.name, owner: dep.owner ?? 'unassigned' }))
  ];

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    health: schedule.health,
    completionPercent: schedule.completionPct,
    onTrack: schedule.health === 'green' && activeRisks.length < 3,
    escalationNeeded,
    criticalPathItems,
    next30DayPlan: [
      'Close blocked dependencies and unresolved high-severity risks',
      'Lock integration specs and mapping baseline for active document types',
      'Complete partner certification and production readiness gate'
    ],
    communicationsPlan: {
      cadence: 'weekly',
      audiences: ['implementation team', 'business stakeholders', 'customer leadership'],
      focusAreas: ['milestone status', 'risk changes', 'go-live readiness']
    },
    toolContracts: [
      {
        tool: 'project.plan.sync',
        purpose: 'Sync milestones and owners with project management system',
        requiredInputs: ['projectId', 'milestones', 'dependencies']
      },
      {
        tool: 'risk.register.update',
        purpose: 'Track and escalate active implementation risks',
        requiredInputs: ['projectId', 'risks', 'severity']
      },
      {
        tool: 'stakeholder.status.publish',
        purpose: 'Publish weekly integration status package',
        requiredInputs: ['projectId', 'health', 'criticalPathItems', 'next30DayPlan']
      }
    ]
  };
}

