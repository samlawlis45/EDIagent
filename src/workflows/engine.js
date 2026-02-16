import { runNewPartnerImplementationWorkflow } from './new-partner-implementation-workflow.js';

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

export function runWorkflow(request) {
  if (request.workflow === 'new_partner_implementation') {
    return runNewPartnerImplementationWorkflow(request.input);
  }

  throw new Error(`Unsupported workflow: ${request.workflow}`);
}

