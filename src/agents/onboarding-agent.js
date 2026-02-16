const DEFAULT_DOC_TYPES = ['purchase_order', 'invoice'];

function requirementsForConnectionType(connectionType) {
  switch (connectionType) {
    case 'AS2':
      return ['as2_endpoint', 'certificate_management', 'mdn_support'];
    case 'SFTP':
      return ['sftp_credentials', 'directory_convention', 'polling_policy'];
    case 'API':
      return ['auth_strategy', 'rate_limit_policy', 'webhook_endpoint'];
    case 'VAN':
      return ['van_mailbox', 'partner_identifier_mapping'];
    default:
      return ['transport_profile'];
  }
}

function requirementsForDocTypes(docTypes) {
  const requirements = new Set(['core_document_validation', 'error_handling_workflow']);

  for (const type of docTypes) {
    if (type === 'purchase_order') requirements.add('po_field_mapping');
    if (type === 'invoice') requirements.add('invoice_total_validation');
    if (type === 'shipment_notice') requirements.add('shipment_tracking_mapping');
  }

  return [...requirements];
}

export function runOnboardingAgent(input) {
  const targetDocumentTypes = input.targetDocumentTypes?.length ? input.targetDocumentTypes : DEFAULT_DOC_TYPES;
  const requiredCapabilities = new Set([
    ...requirementsForConnectionType(input.connectionType),
    ...requirementsForDocTypes(targetDocumentTypes),
    ...(input.requiredCapabilities ?? [])
  ]);
  const existing = new Set((input.existingCapabilities ?? []).map((cap) => cap.trim()).filter(Boolean));
  const missingCapabilities = [...requiredCapabilities].filter((cap) => !existing.has(cap));

  const requiredSteps = [
    'Define transport and authentication profile',
    'Map source payload fields to thin canonical contract',
    'Run test documents for each targeted document type',
    'Configure anomaly and exception routing policies',
    'Enable audit/event export to customer systems'
  ];

  const recommendations = [
    missingCapabilities.length
      ? `Prioritize ${missingCapabilities[0]} before production cutover`
      : 'Baseline capabilities are in place',
    'Start with propose-only mode for agent actions',
    'Add approval workflow for auto-remediation above configured thresholds'
  ];

  const readinessScore = Math.max(
    0,
    Math.min(100, Math.round((1 - missingCapabilities.length / Math.max(requiredCapabilities.size, 1)) * 100))
  );

  return {
    partnerName: input.partnerName,
    readinessScore,
    requiredSteps,
    missingCapabilities,
    recommendations
  };
}

