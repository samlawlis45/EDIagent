import { runDeploymentReadinessAgent } from '../agents/deployment-readiness-agent.js';
import { runIntegrationProgramAgent } from '../agents/integration-program-agent.js';
import { runMappingEngineerAgent } from '../agents/mapping-engineer-agent.js';
import { runOnboardingAgent } from '../agents/onboarding-agent.js';
import { runPostProductionEscalationAgent } from '../agents/post-production-escalation-agent.js';
import { runSpecAnalysisAgent } from '../agents/spec-analysis-agent.js';
import { runStandardsArchitectureAgent } from '../agents/standards-architecture-agent.js';
import { runTestCertificationAgent } from '../agents/test-certification-agent.js';

export function runNewPartnerImplementationWorkflow(input) {
  const integrationProgram = runIntegrationProgramAgent({
    projectId: input.projectId,
    projectName: input.projectName,
    priority: input.program.priority,
    budget: input.program.budget,
    timeline: input.program.timeline,
    milestones: input.program.milestones,
    risks: input.program.risks,
    dependencies: input.program.dependencies,
    stakeholders: input.program.stakeholders
  });

  const onboarding = runOnboardingAgent({
    partnerName: input.partnerName,
    connectionType: input.connectionType,
    targetDocumentTypes: input.targetDocumentTypes
  });

  const specAnalysis = runSpecAnalysisAgent({
    projectId: input.projectId,
    partnerName: input.partnerName,
    documentTypes: input.targetDocumentTypes,
    businessRules: input.businessRules,
    sourceSchema: input.sourceSchema,
    targetSchema: input.targetSchema
  });

  const mappingEngineer = runMappingEngineerAgent({
    projectId: input.projectId,
    partnerId: input.partnerId,
    documentType: input.documentType,
    mappingIntent: input.mappingIntent
  });

  const testCertification = runTestCertificationAgent({
    projectId: input.projectId,
    documentType: input.documentType,
    testResults: input.test.results,
    certificationCriteria: input.test.certificationCriteria,
    defectSummary: input.test.defectSummary,
    partnerCertification: input.test.partnerCertification
  });

  const deploymentReadiness = runDeploymentReadinessAgent({
    projectId: input.projectId,
    environment: input.deployment.environment,
    checklist: input.deployment.checklist,
    approvals: input.deployment.approvals
  });

  const standardsArchitecture = runStandardsArchitectureAgent({
    projectId: input.projectId,
    artifacts: input.standards.artifacts,
    standardsChecklist: input.standards.checklist,
    architectureDecisions: input.standards.architectureDecisions,
    reuseTargets: input.standards.reuseTargets
  });

  const postProductionEscalation = input.postProduction.enabled
    ? runPostProductionEscalationAgent({
        incidentId: input.postProduction.incidentId ?? `${input.projectId}-post-go-live`,
        projectId: input.projectId,
        severity: input.postProduction.severity ?? 'P3',
        symptoms: input.postProduction.symptoms,
        affectedPartners: input.postProduction.affectedPartners,
        runbookSteps: input.postProduction.runbookSteps,
        recentChanges: input.postProduction.recentChanges,
        metrics: input.postProduction.metrics
      })
    : null;

  const blockingReasons = [];

  if (testCertification.certificationDecision === 'not_ready') {
    blockingReasons.push('test_certification_not_ready');
  }
  if (deploymentReadiness.releaseDecision === 'hold') {
    blockingReasons.push('deployment_readiness_hold');
  }
  if (standardsArchitecture.approvalRecommendation === 'revise') {
    blockingReasons.push('standards_review_requires_revision');
  }
  if (integrationProgram.escalationNeeded) {
    blockingReasons.push('integration_program_escalation_required');
  }

  const goLiveRecommendation = blockingReasons.length ? 'hold' : 'proceed';

  return {
    workflow: 'new_partner_implementation',
    projectId: input.projectId,
    partnerName: input.partnerName,
    executedSteps: [
      'integration_program',
      'onboarding',
      'spec_analysis',
      'mapping_engineer',
      'test_certification',
      'deployment_readiness',
      'standards_architecture',
      ...(postProductionEscalation ? ['post_production_escalation'] : [])
    ],
    summary: {
      goLiveRecommendation,
      blockingReasons
    },
    outputs: {
      integrationProgram,
      onboarding,
      specAnalysis,
      mappingEngineer,
      testCertification,
      deploymentReadiness,
      standardsArchitecture,
      postProductionEscalation
    }
  };
}

