function buildMappingRules(mappingIntent = []) {
  return mappingIntent.map((item, index) => ({
    sequence: index + 1,
    targetField: item.targetField,
    sourceField: item.sourceField,
    transform: item.transform ?? 'direct_map',
    required: item.required ?? false,
    defaultValue: item.defaultValue ?? null,
    validation: item.validation ?? null
  }));
}

function buildTestCases(documentType, mappingRules) {
  const requiredTargets = mappingRules.filter((rule) => rule.required).map((rule) => rule.targetField);
  const baseCases = [
    {
      id: `${documentType}-happy-path`,
      description: 'Valid payload maps successfully',
      expected: 'pass'
    },
    {
      id: `${documentType}-missing-required`,
      description: `Missing required target fields: ${requiredTargets.join(', ') || 'none'}`,
      expected: 'fail'
    }
  ];

  if (documentType === 'invoice') {
    baseCases.push({
      id: 'invoice-total-variance',
      description: 'Invoice total outside tolerance should raise exception',
      expected: 'fail'
    });
  }

  return baseCases;
}

export function runMappingEngineerAgent(input) {
  const mappingRules = buildMappingRules(input.mappingIntent);
  const warnings = [];

  if (!mappingRules.length) {
    warnings.push('No mapping intent provided; generated rule set is empty');
  }

  const customTransforms = mappingRules.filter((rule) => rule.transform === 'custom_transform').length;
  if (customTransforms > 0) {
    warnings.push(`${customTransforms} fields require custom transforms and code review`);
  }

  const toolContracts = [
    {
      tool: 'cleo.mapping.apply',
      purpose: 'Apply generated mapping rules to CIC tenant project',
      requiredInputs: ['tenantId', 'projectId', 'mappingRules']
    },
    {
      tool: 'transform.function.deploy',
      purpose: 'Deploy custom transformation helpers required by the mapping',
      requiredInputs: ['projectId', 'functionSpecs', 'version']
    },
    {
      tool: 'test.suite.execute',
      purpose: 'Execute generated mapping regression suite',
      requiredInputs: ['projectId', 'testCases', 'environment']
    }
  ];

  return {
    projectId: input.projectId,
    partnerId: input.partnerId,
    documentType: input.documentType,
    mappingRules,
    generatedTestCases: buildTestCases(input.documentType, mappingRules),
    deploymentPlan: [
      'Apply mapping rules in lower environment',
      'Run regression suite and partner certification tests',
      'Promote mapping package with change ticket linkage'
    ],
    warnings,
    toolContracts
  };
}

