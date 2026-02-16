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
  createWorkflowStep,
  getLatestStepStates,
  getWorkflowRunById,
  updateWorkflowRunInput
} from '../persistence/workflow-store.js';
import { resolveExecutionConfig } from '../policy/engine.js';
import { executeToolContracts } from '../tools/registry.js';
import { publishEvent } from '../events/bus.js';

const WORKFLOW_STEPS = [
  'integration_program',
  'onboarding',
  'spec_analysis',
  'mapping_engineer',
  'test_certification',
  'deployment_readiness',
  'standards_architecture',
  'post_production_escalation'
];

const STEP_RUNNERS = {
  integration_program: (input) =>
    runIntegrationProgramAgent({
      projectId: input.projectId,
      projectName: input.projectName,
      priority: input.program.priority,
      budget: input.program.budget,
      timeline: input.program.timeline,
      milestones: input.program.milestones,
      risks: input.program.risks,
      dependencies: input.program.dependencies,
      stakeholders: input.program.stakeholders
    }),
  onboarding: (input) =>
    runOnboardingAgent({
      partnerName: input.partnerName,
      connectionType: input.connectionType,
      targetDocumentTypes: input.targetDocumentTypes
    }),
  spec_analysis: (input) =>
    runSpecAnalysisAgent({
      projectId: input.projectId,
      partnerName: input.partnerName,
      documentTypes: input.targetDocumentTypes,
      businessRules: input.businessRules,
      sourceSchema: input.sourceSchema,
      targetSchema: input.targetSchema
    }),
  mapping_engineer: (input) =>
    runMappingEngineerAgent({
      projectId: input.projectId,
      partnerId: input.partnerId,
      documentType: input.documentType,
      mappingIntent: input.mappingIntent
    }),
  test_certification: (input) =>
    runTestCertificationAgent({
      projectId: input.projectId,
      documentType: input.documentType,
      testResults: input.test.results,
      certificationCriteria: input.test.certificationCriteria,
      defectSummary: input.test.defectSummary,
      partnerCertification: input.test.partnerCertification
    }),
  deployment_readiness: (input) =>
    runDeploymentReadinessAgent({
      projectId: input.projectId,
      environment: input.deployment.environment,
      checklist: input.deployment.checklist,
      approvals: input.deployment.approvals
    }),
  standards_architecture: (input) =>
    runStandardsArchitectureAgent({
      projectId: input.projectId,
      artifacts: input.standards.artifacts,
      standardsChecklist: input.standards.checklist,
      architectureDecisions: input.standards.architectureDecisions,
      reuseTargets: input.standards.reuseTargets
    }),
  post_production_escalation: (input) => {
    if (!input.postProduction.enabled) return null;
    return runPostProductionEscalationAgent({
      incidentId: input.postProduction.incidentId ?? `${input.projectId}-post-go-live`,
      projectId: input.projectId,
      severity: input.postProduction.severity ?? 'P3',
      symptoms: input.postProduction.symptoms,
      affectedPartners: input.postProduction.affectedPartners,
      runbookSteps: input.postProduction.runbookSteps,
      recentChanges: input.postProduction.recentChanges,
      metrics: input.postProduction.metrics
    });
  }
};

function isScopeApproved(approvals, scope) {
  const required = approvals.filter((approval) => approval.scope === scope && approval.required !== false);
  if (!required.length) return false;
  return required.every((approval) => approval.status === 'approved');
}

function mergeExecutionOverride(input, override) {
  if (!override) return input;
  return {
    ...input,
    execution: {
      ...input.execution,
      ...override,
      approvals: override.approvals ?? input.execution.approvals,
      enabledTools: override.enabledTools ?? input.execution.enabledTools
    }
  };
}

function mergeRetryPolicy(input, override) {
  if (!override) return input;
  return {
    ...input,
    retryPolicy: {
      ...(input.retryPolicy ?? {}),
      ...override
    }
  };
}

async function sleep(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStep({ tenantId, runId, stepName, adapterId, workflowInput, executionConfig, retryPolicy }) {
  const maxAttempts = retryPolicy.maxAttempts ?? 3;
  const backoffMs = retryPolicy.backoffMs ?? 250;
  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    const step = createWorkflowStep(tenantId, runId, stepName);
    const startedPayload = { stepName, stepId: step.id, attempt: step.attempt };
    createWorkflowEvent(tenantId, runId, 'workflow.step.started', startedPayload);
    publishEvent(tenantId, 'workflow.step.started', { runId, ...startedPayload });

    try {
      const raw = STEP_RUNNERS[stepName](workflowInput);
      if (raw === null) {
        completeWorkflowStep(step.id, 'completed', null);
        createWorkflowEvent(runId, 'workflow.step.skipped', { stepName, reason: 'not_enabled' });
        return null;
      }

      const toolContracts = Array.isArray(raw?.toolContracts) ? raw.toolContracts : [];
      const toolResults = await executeToolContracts({
        adapterId,
        contracts: toolContracts,
        context: {
          workflowInput,
          latestStepOutput: raw
        },
        executeTools: executionConfig.approvalMode === 'execute' && executionConfig.executeTools,
        enabledTools: executionConfig.enabledTools,
        tenantId,
        workflowRunId: runId,
      });

      const finalOutput = {
        ...raw,
        toolExecution: toolResults
      };

      completeWorkflowStep(step.id, 'completed', finalOutput);
      const completedPayload = {
        stepName,
        stepId: step.id,
        attempt: step.attempt,
        toolExecution: toolResults
      };
      createWorkflowEvent(tenantId, runId, 'workflow.step.completed', completedPayload);
      publishEvent(tenantId, 'workflow.step.completed', { runId, ...completedPayload });
      return finalOutput;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      const status = attempt >= maxAttempts ? 'failed' : 'retrying';
      completeWorkflowStep(step.id, status, null, message);
      const failedPayload = {
        stepName,
        stepId: step.id,
        attempt: step.attempt,
        status,
        error: message
      };
      createWorkflowEvent(tenantId, runId, 'workflow.step.failed', failedPayload);
      publishEvent(tenantId, 'workflow.step.failed', { runId, ...failedPayload });
      if (attempt < maxAttempts) {
        await sleep(backoffMs * attempt);
      }
    }
  }

  throw new Error(`Step ${stepName} failed after ${maxAttempts} attempts: ${lastError ?? 'unknown error'}`);
}

function selectStepsToRun(input, fromStep) {
  const enabled = input.postProduction.enabled
    ? WORKFLOW_STEPS
    : WORKFLOW_STEPS.filter((step) => step !== 'post_production_escalation');

  if (!fromStep) return enabled;
  const index = enabled.indexOf(fromStep);
  if (index === -1) return enabled;
  return enabled.slice(index);
}

function buildSummary(outputs, executionConfig, workflowRules) {
  const blockingReasons = [];

  if (outputs.testCertification?.certificationDecision === 'not_ready') {
    blockingReasons.push('test_certification_not_ready');
  }
  if (outputs.deploymentReadiness?.releaseDecision === 'hold') {
    blockingReasons.push('deployment_readiness_hold');
  }
  if (outputs.standardsArchitecture?.approvalRecommendation === 'revise') {
    blockingReasons.push('standards_review_requires_revision');
  }
  if (outputs.integrationProgram?.escalationNeeded) {
    blockingReasons.push('integration_program_escalation_required');
  }

  if (executionConfig.approvalMode === 'execute') {
    for (const scope of workflowRules.executeScopes ?? []) {
      if (!isScopeApproved(executionConfig.approvals, scope)) {
        blockingReasons.push(`${scope}_approval_missing`);
      }
    }
    if (outputs.postProductionEscalation && workflowRules.postProductionScope) {
      if (!isScopeApproved(executionConfig.approvals, workflowRules.postProductionScope)) {
        blockingReasons.push(`${workflowRules.postProductionScope}_approval_missing`);
      }
    }
  }

  return {
    goLiveRecommendation: blockingReasons.length ? 'hold' : 'proceed',
    blockingReasons
  };
}

async function executeWorkflow({ tenantId, runId, adapterId, workflowInput, fromStep }) {
  const { execution: executionConfig, workflowRules, retryPolicy } = resolveExecutionConfig(
    'new_partner_implementation',
    workflowInput
  );
  const stepsToRun = selectStepsToRun(workflowInput, fromStep);
  const outputs = {};

  for (const stepName of stepsToRun) {
    const result = await runStep({
      tenantId,
      runId,
      stepName,
      adapterId,
      workflowInput,
      executionConfig,
      retryPolicy
    });
    if (stepName === 'integration_program') outputs.integrationProgram = result;
    if (stepName === 'onboarding') outputs.onboarding = result;
    if (stepName === 'spec_analysis') outputs.specAnalysis = result;
    if (stepName === 'mapping_engineer') outputs.mappingEngineer = result;
    if (stepName === 'test_certification') outputs.testCertification = result;
    if (stepName === 'deployment_readiness') outputs.deploymentReadiness = result;
    if (stepName === 'standards_architecture') outputs.standardsArchitecture = result;
    if (stepName === 'post_production_escalation') outputs.postProductionEscalation = result;
  }

  const summary = buildSummary(outputs, executionConfig, workflowRules);
  return {
    executedSteps: stepsToRun,
    outputs,
    summary
  };
}

export async function runNewPartnerImplementationWorkflow({ adapterId, workflowInput }) {
  const tenantId = workflowInput.tenantId ?? 'default';
  const { execution } = resolveExecutionConfig('new_partner_implementation', workflowInput);
  const run = createWorkflowRun({
    tenantId,
    workflow: 'new_partner_implementation',
    adapter: adapterId,
    projectId: workflowInput.projectId,
    partnerName: workflowInput.partnerName,
    approvalMode: execution.approvalMode,
    input: workflowInput
  });
  const runId = run.id;
  const startedPayload = {
    workflow: 'new_partner_implementation',
    projectId: workflowInput.projectId,
    approvalMode: execution.approvalMode
  };
  createWorkflowEvent(tenantId, runId, 'workflow.run.started', startedPayload);
  publishEvent(tenantId, 'workflow.run.started', { runId, ...startedPayload });

  try {
    const executionResult = await executeWorkflow({
      tenantId,
      runId,
      adapterId,
      workflowInput
    });

    const result = {
      runId,
      workflow: 'new_partner_implementation',
      projectId: workflowInput.projectId,
      partnerName: workflowInput.partnerName,
      executedSteps: executionResult.executedSteps,
      summary: executionResult.summary,
      outputs: executionResult.outputs
    };

    completeWorkflowRun(runId, {
      status: executionResult.summary.goLiveRecommendation === 'proceed' ? 'completed' : 'hold',
      goLiveRecommendation: executionResult.summary.goLiveRecommendation,
      blockingReasons: executionResult.summary.blockingReasons,
      output: result
    });
    createWorkflowEvent(tenantId, runId, 'workflow.run.completed', executionResult.summary);
    publishEvent(tenantId, 'workflow.run.completed', { runId, ...executionResult.summary });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    completeWorkflowRun(runId, {
      status: 'failed',
      goLiveRecommendation: null,
      blockingReasons: ['workflow_execution_failed'],
      output: { error: message }
    });
    createWorkflowEvent(tenantId, runId, 'workflow.run.failed', { error: message });
    publishEvent(tenantId, 'workflow.run.failed', { runId, error: message });
    throw error;
  }
}

function chooseResumeStep(tenantId, run) {
  const latestSteps = getLatestStepStates(tenantId, run.id);
  for (const stepName of WORKFLOW_STEPS) {
    if (stepName === 'post_production_escalation' && !run.input?.postProduction?.enabled) continue;
    const state = latestSteps.get(stepName);
    if (!state) return stepName;
    if (state.status !== 'completed') return stepName;
  }
  return 'deployment_readiness';
}

export async function resumeNewPartnerImplementationWorkflow({ runId, override = {} }) {
  const tenantId = override.tenantId ?? 'default';
  const run = getWorkflowRunById(tenantId, runId);
  if (!run) throw new Error(`Workflow run not found: ${runId}`);
  if (run.workflow !== 'new_partner_implementation') {
    throw new Error(`Unsupported workflow for resume: ${run.workflow}`);
  }

  let workflowInput = run.input ?? {};
  workflowInput = mergeExecutionOverride(workflowInput, override.execution);
  workflowInput = mergeRetryPolicy(workflowInput, override.retryPolicy);
  workflowInput.tenantId = tenantId;
  updateWorkflowRunInput(tenantId, runId, workflowInput);
  const resumedPayload = {
    override,
    resumedAt: new Date().toISOString()
  };
  createWorkflowEvent(tenantId, runId, 'workflow.run.resumed', resumedPayload);
  publishEvent(tenantId, 'workflow.run.resumed', { runId, ...resumedPayload });

  const fromStep = override.fromStep ?? chooseResumeStep(tenantId, run);
  const { execution } = resolveExecutionConfig('new_partner_implementation', workflowInput);

  try {
    const executionResult = await executeWorkflow({
      tenantId,
      runId,
      adapterId: run.adapter,
      workflowInput,
      fromStep
    });

    const result = {
      runId,
      workflow: 'new_partner_implementation',
      projectId: workflowInput.projectId,
      partnerName: workflowInput.partnerName,
      resumedFromStep: fromStep,
      executedSteps: executionResult.executedSteps,
      summary: executionResult.summary,
      outputs: executionResult.outputs
    };

    completeWorkflowRun(runId, {
      status: executionResult.summary.goLiveRecommendation === 'proceed' ? 'completed' : 'hold',
      goLiveRecommendation: executionResult.summary.goLiveRecommendation,
      blockingReasons: executionResult.summary.blockingReasons,
      output: result
    });
    const completedPayload = {
      ...executionResult.summary,
      resumedFromStep: fromStep,
      approvalMode: execution.approvalMode
    };
    createWorkflowEvent(tenantId, runId, 'workflow.run.completed', completedPayload);
    publishEvent(tenantId, 'workflow.run.completed', { runId, ...completedPayload });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    completeWorkflowRun(runId, {
      status: 'failed',
      goLiveRecommendation: null,
      blockingReasons: ['workflow_resume_failed'],
      output: { error: message }
    });
    const failedPayload = { error: message, resumedFromStep: fromStep };
    createWorkflowEvent(tenantId, runId, 'workflow.run.failed', failedPayload);
    publishEvent(tenantId, 'workflow.run.failed', { runId, ...failedPayload });
    throw error;
  }
}
