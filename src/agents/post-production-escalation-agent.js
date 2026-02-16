function evaluateTriageLevel(severity, impactedPartnerCount, thresholdBreaches) {
  if (severity === 'P1' || thresholdBreaches > 1 || impactedPartnerCount > 3) return 'immediate';
  if (severity === 'P2' || impactedPartnerCount > 1) return 'high';
  return 'normal';
}

export function runPostProductionEscalationAgent(input) {
  const thresholdBreaches = (input.metrics ?? []).filter((metric) => {
    if (metric.direction === 'above_is_bad') return metric.value > metric.threshold;
    if (metric.direction === 'below_is_bad') return metric.value < metric.threshold;
    return false;
  });

  const triageLevel = evaluateTriageLevel(
    input.severity,
    (input.affectedPartners ?? []).length,
    thresholdBreaches.length
  );

  const containmentActions = [
    'Isolate impacted partner routes and pause risky automations',
    'Enable safe fallback or manual processing path',
    'Capture run evidence and rollback recent high-risk changes if needed'
  ];

  const suspectedCauses = [
    ...(input.recentChanges ?? []).length
      ? ['Recent deployment or configuration change']
      : [],
    ...(thresholdBreaches.length ? ['Operational metric threshold breach'] : []),
    'Partner payload drift or schema mismatch'
  ];

  return {
    incidentId: input.incidentId,
    triageLevel,
    affectedPartners: input.affectedPartners ?? [],
    thresholdBreaches: thresholdBreaches.map((metric) => ({
      name: metric.name,
      value: metric.value,
      threshold: metric.threshold
    })),
    suspectedCauses,
    containmentActions,
    escalationPath: triageLevel === 'immediate'
      ? ['Notify on-call leadership', 'Engage integration SME bridge', 'Open executive incident channel']
      : ['Notify operations owner', 'Assign remediation lead', 'Track corrective action'],
    communications: {
      internalUpdateCadenceMinutes: triageLevel === 'immediate' ? 15 : 60,
      externalUpdateCadenceMinutes: triageLevel === 'immediate' ? 30 : 120
    },
    autoRemediationRecommended: triageLevel !== 'immediate',
    toolContracts: [
      {
        tool: 'incident.bridge.open',
        purpose: 'Open incident bridge and assign on-call responders',
        requiredInputs: ['incidentId', 'severity', 'affectedPartners']
      },
      {
        tool: 'runbook.execute',
        purpose: 'Execute approved escalation runbook actions',
        requiredInputs: ['incidentId', 'runbookId', 'steps']
      },
      {
        tool: 'stakeholder.alert.send',
        purpose: 'Send internal and external incident updates',
        requiredInputs: ['incidentId', 'triageLevel', 'nextUpdateAt']
      }
    ]
  };
}

