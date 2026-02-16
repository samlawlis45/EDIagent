import { getAdapter, listAdapters } from './adapters/registry.js';
import { runDeploymentReadinessAgent } from './agents/deployment-readiness-agent.js';
import { runInvoiceAnomalyAgent } from './agents/invoice-anomaly-agent.js';
import { runMappingEngineerAgent } from './agents/mapping-engineer-agent.js';
import { runOnboardingAgent } from './agents/onboarding-agent.js';
import { runSpecAnalysisAgent } from './agents/spec-analysis-agent.js';

const SUPPORTED_AGENTS = [
  { id: 'onboarding', description: 'Assesses partner readiness and produces onboarding actions' },
  { id: 'invoice_anomaly', description: 'Detects mismatches between invoice, PO, and shipment notice' },
  { id: 'spec_analysis', description: 'Builds integration specification coverage, risks, and open questions' },
  { id: 'mapping_engineer', description: 'Generates mapping rules, test cases, and deployment sequence' },
  { id: 'deployment_readiness', description: 'Scores release readiness and enforces production gates' }
];

export function getAgentCoreCapabilities() {
  return {
    agents: SUPPORTED_AGENTS,
    adapters: listAdapters()
  };
}

export function runAgent(request) {
  if (request.agent === 'onboarding') {
    return runOnboardingAgent(request.input);
  }

  if (request.agent === 'spec_analysis') {
    return runSpecAnalysisAgent(request.input);
  }

  if (request.agent === 'mapping_engineer') {
    return runMappingEngineerAgent(request.input);
  }

  if (request.agent === 'deployment_readiness') {
    return runDeploymentReadinessAgent(request.input);
  }

  const adapter = getAdapter(request.adapter);
  const invoice = adapter.normalizeDocument(request.input.invoice);
  const purchaseOrder = request.input.purchaseOrder
    ? adapter.normalizeDocument(request.input.purchaseOrder)
    : undefined;
  const shipmentNotice = request.input.shipmentNotice
    ? adapter.normalizeDocument(request.input.shipmentNotice)
    : undefined;

  return runInvoiceAnomalyAgent(invoice, purchaseOrder, shipmentNotice, request.input.tolerance);
}
