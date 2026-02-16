function computeComplianceScore(checklist = []) {
  if (!checklist.length) return 0;
  const passed = checklist.filter((item) => item.passed).length;
  return Math.round((passed / checklist.length) * 100);
}

export function runStandardsArchitectureAgent(input) {
  const checklist = input.standardsChecklist ?? [];
  const violations = checklist
    .filter((item) => !item.passed)
    .map((item) => ({
      ruleId: item.ruleId,
      severity: item.severity,
      description: item.description,
      notes: item.notes ?? null
    }));

  const mustViolations = violations.filter((v) => v.severity === 'must');
  const complianceScore = computeComplianceScore(checklist);
  const approvalRecommendation = mustViolations.length ? 'revise' : 'approve';

  return {
    projectId: input.projectId,
    complianceScore,
    approvalRecommendation,
    violations,
    standardizationOpportunities: [
      'Increase reuse of approved mapping templates and shared transforms',
      'Normalize exception handling and escalation policies across partners',
      'Adopt a single deployment readiness checklist for all implementations'
    ],
    referencePatterns: [
      'Thin canonical contract + adapter model',
      'Spec baseline -> mapping build -> certification -> release gate',
      'Policy-driven post-production escalation workflow'
    ],
    architectureDecisionSummary: (input.architectureDecisions ?? []).map((decision) => ({
      decision: decision.decision,
      status: decision.status
    })),
    toolContracts: [
      {
        tool: 'architecture.review.record',
        purpose: 'Record architecture decision and standards compliance evidence',
        requiredInputs: ['projectId', 'violations', 'architectureDecisions']
      },
      {
        tool: 'template.catalog.enforce',
        purpose: 'Enforce approved reusable integration patterns',
        requiredInputs: ['projectId', 'reuseTargets']
      },
      {
        tool: 'governance.report.publish',
        purpose: 'Publish standards review report for leadership sign-off',
        requiredInputs: ['projectId', 'complianceScore', 'approvalRecommendation']
      }
    ]
  };
}

