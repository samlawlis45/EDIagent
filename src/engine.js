import { getAdapter, listAdapters } from './adapters/registry.js';
import { runDeploymentReadinessAgent } from './agents/deployment-readiness-agent.js';
import { runIntegrationProgramAgent } from './agents/integration-program-agent.js';
import { runInvoiceAnomalyAgent } from './agents/invoice-anomaly-agent.js';
import { runMappingEngineerAgent } from './agents/mapping-engineer-agent.js';
import { runOnboardingAgent } from './agents/onboarding-agent.js';
import { runPostProductionEscalationAgent } from './agents/post-production-escalation-agent.js';
import { runSpecAnalysisAgent } from './agents/spec-analysis-agent.js';
import { runStandardsArchitectureAgent } from './agents/standards-architecture-agent.js';
import { runTestCertificationAgent } from './agents/test-certification-agent.js';

const SUPPORTED_AGENTS = [
  { id: 'integration_program', description: 'Manages implementation portfolio, risks, and delivery plan health' },
  { id: 'onboarding', description: 'Assesses partner readiness and produces onboarding actions' },
  { id: 'invoice_anomaly', description: 'Detects mismatches between invoice, PO, and shipment notice' },
  { id: 'spec_analysis', description: 'Builds integration specification coverage, risks, and open questions' },
  { id: 'mapping_engineer', description: 'Generates mapping rules, test cases, and deployment sequence' },
  { id: 'test_certification', description: 'Evaluates test evidence and determines certification readiness' },
  { id: 'deployment_readiness', description: 'Scores release readiness and enforces production gates' },
  { id: 'post_production_escalation', description: 'Triages production incidents and proposes containment actions' },
  { id: 'standards_architecture', description: 'Enforces architecture standards and reuse patterns' }
];

export function getAgentCoreCapabilities() {
  return {
    agents: SUPPORTED_AGENTS,
    adapters: listAdapters()
  };
}

export function runAgent(request) {
  if (request.agent === 'integration_program') {
    return runIntegrationProgramAgent(request.input);
  }

  if (request.agent === 'onboarding') {
    return runOnboardingAgent(request.input);
  }

  if (request.agent === 'spec_analysis') {
    return runSpecAnalysisAgent(request.input);
  }

  if (request.agent === 'mapping_engineer') {
    return runMappingEngineerAgent(request.input);
  }

  if (request.agent === 'test_certification') {
    return runTestCertificationAgent(request.input);
  }

  if (request.agent === 'deployment_readiness') {
    return runDeploymentReadinessAgent(request.input);
  }

  if (request.agent === 'post_production_escalation') {
    return runPostProductionEscalationAgent(request.input);
  }

  if (request.agent === 'standards_architecture') {
    return runStandardsArchitectureAgent(request.input);
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
