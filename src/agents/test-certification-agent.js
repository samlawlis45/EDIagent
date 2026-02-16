function computeQualityScore(testResults = [], defectSummary = {}) {
  if (!testResults.length) return 0;
  const passCount = testResults.filter((result) => result.status === 'pass').length;
  let score = Math.round((passCount / testResults.length) * 100);

  score -= (defectSummary.openCritical ?? 0) * 15;
  score -= (defectSummary.openHigh ?? 0) * 8;
  score -= (defectSummary.openMedium ?? 0) * 3;

  return Math.max(0, Math.min(100, score));
}

export function runTestCertificationAgent(input) {
  const qualityScore = computeQualityScore(input.testResults, input.defectSummary);
  const unmetCriteria = (input.certificationCriteria ?? []).filter((criterion) => !criterion.met && criterion.required !== false);
  const blockers = [
    ...unmetCriteria.map((criterion) => ({ type: 'criteria', name: criterion.name })),
    ...(input.testResults ?? [])
      .filter((result) => result.status !== 'pass')
      .map((result) => ({ type: 'test', name: result.caseId, status: result.status }))
  ];

  if ((input.defectSummary?.openCritical ?? 0) > 0) {
    blockers.push({ type: 'defect', name: 'Open critical defects' });
  }

  if (input.partnerCertification?.required && input.partnerCertification.status !== 'approved') {
    blockers.push({ type: 'partner_certification', name: 'Partner certification incomplete' });
  }

  const certificationDecision = blockers.length ? (qualityScore >= 80 ? 'conditional' : 'not_ready') : 'certified';

  return {
    projectId: input.projectId,
    documentType: input.documentType,
    qualityScore,
    certificationDecision,
    blockers,
    retestPlan: [
      'Re-run failed and blocked test cases after mapping fixes',
      'Re-validate required certification criteria',
      'Execute final regression suite before release gate'
    ],
    recommendedActions: blockers.length
      ? ['Resolve blockers and re-run certification workflow']
      : ['Proceed to deployment readiness gate'],
    toolContracts: [
      {
        tool: 'test.execution.run',
        purpose: 'Execute E2E test suite for certification',
        requiredInputs: ['projectId', 'documentType', 'suiteId']
      },
      {
        tool: 'defect.tracker.sync',
        purpose: 'Sync open defect status into certification report',
        requiredInputs: ['projectId', 'defectSummary']
      },
      {
        tool: 'certification.report.publish',
        purpose: 'Publish certification decision and evidence',
        requiredInputs: ['projectId', 'qualityScore', 'certificationDecision', 'blockers']
      }
    ]
  };
}

