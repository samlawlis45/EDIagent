import {
  resumeNewPartnerImplementationWorkflow,
  runNewPartnerImplementationWorkflow
} from './new-partner-implementation-workflow.js';
import { getWorkflowRunById, listWorkflowRuns } from '../persistence/workflow-store.js';

const SUPPORTED_WORKFLOWS = [
  {
    id: 'new_partner_implementation',
    description: 'Runs end-to-end implementation lifecycle across role agents'
  }
];

export function getWorkflowCapabilities() {
  return {
    workflows: SUPPORTED_WORKFLOWS
  };
}

export async function runWorkflow(request) {
  if (request.workflow === 'new_partner_implementation') {
    return runNewPartnerImplementationWorkflow({
      adapterId: request.adapter,
      workflowInput: request.input
    });
  }

  throw new Error(`Unsupported workflow: ${request.workflow}`);
}

export function getWorkflowRun(runId) {
  return getWorkflowRunById(runId);
}

export function getWorkflowRuns(filters = {}) {
  return listWorkflowRuns(filters);
}

export async function resumeWorkflowRun(runId, override = {}) {
  const run = getWorkflowRunById(runId);
  if (!run) {
    throw new Error(`Workflow run not found: ${runId}`);
  }
  if (run.workflow === 'new_partner_implementation') {
    return resumeNewPartnerImplementationWorkflow({ runId, override });
  }
  throw new Error(`Resume unsupported for workflow: ${run.workflow}`);
}
