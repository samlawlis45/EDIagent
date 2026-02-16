import { runDeploymentReadinessAgent } from '../agents/deployment-readiness-agent.js';
import { runIntegrationProgramAgent } from '../agents/integration-program-agent.js';
import { runMappingEngineerAgent } from '../agents/mapping-engineer-agent.js';
import { runOnboardingAgent } from '../agents/onboarding-agent.js';
import { runPostProductionEscalationAgent } from '../agents/post-production-escalation-agent.js';
import { runSpecAnalysisAgent } from '../agents/spec-analysis-agent.js';
import { runStandardsArchitectureAgent } from '../agents/standards-architecture-agent.js';
import { runTestCertificationAgent } from '../agents/test-certification-agent.js';
import {
  completeWorkflowRun,
  completeWorkflowStep,
  createWorkflowEvent,
  createWorkflowRun,
  createWorkflowStep
} from '../persistence/workflow-store.js';
import { executeToolContracts } from '../tools/registry.js';

function isScopeApproved(approvals, scope) {
  const required = approvals.filter((approval) => approval.scope === scope && approval.required !== false);
  if (!required.length) return false;
  return required.every((approval) => approval.status === 'approved');
}

function runStep({ runId, stepName, fn, adapterId, workflowInput, executionConfig }) {
  const step = createWorkflowStep(runId, stepName);
  createWorkflowEvent(runId, 'workflow.step.started', { stepName, stepId: step.id });

  try {
    const output = fn();
    const toolContracts = Array.isArray(output?.toolContracts) ? output.toolContracts : [];
    const toolResults = executeToolContracts({
      adapterId,
      contracts: toolContracts,
      context: {
        workflowInput,
        latestStepOutput: output
      },
      executeTools: executionConfig.approvalMode === 'execute' && executionConfig.executeTools,
      enabledTools: executionConfig.enabledTools
    });

    const finalOutput = {
      ...output,
      toolExecution: toolResults
    };

    completeWorkflowStep(step.id, 'completed', finalOutput);
    createWorkflowEvent(runId, 'workflow.step.completed', {
      stepName,
      stepId: step.id,
      toolExecution: toolResults
    });

    return finalOutput;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    completeWorkflowStep(step.id, 'failed', null, message);
    createWorkflowEvent(runId, 'workflow.step.failed', { stepName, stepId: step.id, error: message });
    throw error;
  }
}

export function runNewPartnerImplementationWorkflow(args) {
  const {
    adapterId,
    workflowInput
  } = args;
  const executionConfig = {
    approvalMode: workflowInput.execution.approvalMode,
    executeTools: workflowInput.execution.executeTools,
    enabledTools: workflowInput.execution.enabledTools,
    approvals: workflowInput.execution.approvals
  };

  const run = createWorkflowRun({
    workflow: 'new_partner_implementation',
    adapter: adapterId,
    projectId: workflowInput.projectId,
    partnerName: workflowInput.partnerName,
    approvalMode: executionConfig.approvalMode,
    input: workflowInput
  });
  const runId = run.id;
  createWorkflowEvent(runId, 'workflow.run.started', {
    workflow: 'new_partner_implementation',
    projectId: workflowInput.projectId,
    approvalMode: executionConfig.approvalMode
  });

  try {
    const integrationProgram = runStep({
      runId,
      stepName: 'integration_program',
      fn: () =>
        runIntegrationProgramAgent({
          projectId: workflowInput.projectId,
          projectName: workflowInput.projectName,
          priority: workflowInput.program.priority,
          budget: workflowInput.program.budget,
          timeline: workflowInput.program.timeline,
          milestones: workflowInput.program.milestones,
          risks: workflowInput.program.risks,
          dependencies: workflowInput.program.dependencies,
          stakeholders: workflowInput.program.stakeholders
        }),
      adapterId,
      workflowInput,
      executionConfig
    });

    const onboarding = runStep({
      runId,
      stepName: 'onboarding',
      fn: () =>
        runOnboardingAgent({
          partnerName: workflowInput.partnerName,
          connectionType: workflowInput.connectionType,
          targetDocumentTypes: workflowInput.targetDocumentTypes
        }),
      adapterId,
      workflowInput,
      executionConfig
    });

    const specAnalysis = runStep({
      runId,
      stepName: 'spec_analysis',
      fn: () =>
        runSpecAnalysisAgent({
          projectId: workflowInput.projectId,
          partnerName: workflowInput.partnerName,
          documentTypes: workflowInput.targetDocumentTypes,
          businessRules: workflowInput.businessRules,
          sourceSchema: workflowInput.sourceSchema,
          targetSchema: workflowInput.targetSchema
        }),
      adapterId,
      workflowInput,
      executionConfig
    });

    const mappingEngineer = runStep({
      runId,
      stepName: 'mapping_engineer',
      fn: () =>
        runMappingEngineerAgent({
          projectId: workflowInput.projectId,
          partnerId: workflowInput.partnerId,
          documentType: workflowInput.documentType,
          mappingIntent: workflowInput.mappingIntent
        }),
      adapterId,
      workflowInput,
      executionConfig
    });

    const testCertification = runStep({
      runId,
      stepName: 'test_certification',
      fn: () =>
        runTestCertificationAgent({
          projectId: workflowInput.projectId,
          documentType: workflowInput.documentType,
          testResults: workflowInput.test.results,
          certificationCriteria: workflowInput.test.certificationCriteria,
          defectSummary: workflowInput.test.defectSummary,
          partnerCertification: workflowInput.test.partnerCertification
        }),
      adapterId,
      workflowInput,
      executionConfig
    });

    const deploymentReadiness = runStep({
      runId,
      stepName: 'deployment_readiness',
      fn: () =>
        runDeploymentReadinessAgent({
          projectId: workflowInput.projectId,
          environment: workflowInput.deployment.environment,
          checklist: workflowInput.deployment.checklist,
          approvals: workflowInput.deployment.approvals
        }),
      adapterId,
      workflowInput,
      executionConfig
    });

    const standardsArchitecture = runStep({
      runId,
      stepName: 'standards_architecture',
      fn: () =>
        runStandardsArchitectureAgent({
          projectId: workflowInput.projectId,
          artifacts: workflowInput.standards.artifacts,
          standardsChecklist: workflowInput.standards.checklist,
          architectureDecisions: workflowInput.standards.architectureDecisions,
          reuseTargets: workflowInput.standards.reuseTargets
        }),
      adapterId,
      workflowInput,
      executionConfig
    });

    const postProductionEscalation = workflowInput.postProduction.enabled
      ? runStep({
          runId,
          stepName: 'post_production_escalation',
          fn: () =>
            runPostProductionEscalationAgent({
              incidentId: workflowInput.postProduction.incidentId ?? `${workflowInput.projectId}-post-go-live`,
              projectId: workflowInput.projectId,
              severity: workflowInput.postProduction.severity ?? 'P3',
              symptoms: workflowInput.postProduction.symptoms,
              affectedPartners: workflowInput.postProduction.affectedPartners,
              runbookSteps: workflowInput.postProduction.runbookSteps,
              recentChanges: workflowInput.postProduction.recentChanges,
              metrics: workflowInput.postProduction.metrics
            }),
          adapterId,
          workflowInput,
          executionConfig
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

    if (executionConfig.approvalMode === 'execute') {
      if (!isScopeApproved(executionConfig.approvals, 'workflow_execute')) {
        blockingReasons.push('workflow_execute_approval_missing');
      }
      if (deploymentReadiness.releaseDecision === 'ready' &&
          !isScopeApproved(executionConfig.approvals, 'deployment_execute')) {
        blockingReasons.push('deployment_execute_approval_missing');
      }
      if (postProductionEscalation &&
          !isScopeApproved(executionConfig.approvals, 'post_production_escalation_execute')) {
        blockingReasons.push('post_production_escalation_execute_approval_missing');
      }
    }

    const goLiveRecommendation = blockingReasons.length ? 'hold' : 'proceed';
    const result = {
      runId,
      workflow: 'new_partner_implementation',
      projectId: workflowInput.projectId,
      partnerName: workflowInput.partnerName,
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

    completeWorkflowRun(runId, {
      status: goLiveRecommendation === 'proceed' ? 'completed' : 'hold',
      goLiveRecommendation,
      blockingReasons,
      output: result
    });
    createWorkflowEvent(runId, 'workflow.run.completed', {
      goLiveRecommendation,
      blockingReasons
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    completeWorkflowRun(runId, {
      status: 'failed',
      goLiveRecommendation: null,
      blockingReasons: ['workflow_execution_failed'],
      output: { error: message }
    });
    createWorkflowEvent(runId, 'workflow.run.failed', {
      error: message
    });
    throw error;
  }
}

