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

export async function runWorkflow(request, authContext = { tenantId: 'default' }) {
  if (request.workflow === 'new_partner_implementation') {
    const workflowInput = {
      ...request.input,
      tenantId: authContext.tenantId
    };
    return runNewPartnerImplementationWorkflow({
      adapterId: request.adapter,
      workflowInput
    });
  }

  throw new Error(`Unsupported workflow: ${request.workflow}`);
}

export function getWorkflowRun(tenantId, runId) {
  return getWorkflowRunById(tenantId, runId);
}

export function getWorkflowRuns(tenantId, filters = {}) {
  return listWorkflowRuns({ ...filters, tenantId });
}

export async function resumeWorkflowRun(tenantId, runId, override = {}) {
  const run = getWorkflowRunById(tenantId, runId);
  if (!run) {
    throw new Error(`Workflow run not found: ${runId}`);
  }
  if (run.workflow === 'new_partner_implementation') {
    return resumeNewPartnerImplementationWorkflow({ runId, override: { ...override, tenantId } });
  }
  throw new Error(`Resume unsupported for workflow: ${run.workflow}`);
}
