function inferTransform(sourceType, targetType) {
  if (sourceType === targetType) return 'direct_map';
  if (targetType === 'number' && sourceType === 'string') return 'parse_number';
  if (targetType === 'date' && sourceType === 'string') return 'parse_date';
  return 'custom_transform';
}

function buildCoverage(sourceFields, targetFields) {
  const normalizedSource = sourceFields.map((field) => ({
    ...field,
    key: String(field.name ?? '').toLowerCase()
  }));

  return targetFields.map((target) => {
    const targetKey = String(target.name ?? '').toLowerCase();
    const match = normalizedSource.find((source) => source.key === targetKey);

    if (!match) {
      return {
        targetField: target.name,
        status: 'unmapped',
        confidence: 0,
        rationale: 'No matching source field by name'
      };
    }

    return {
      targetField: target.name,
      sourceField: match.name,
      status: 'mapped',
      confidence: 0.9,
      transform: inferTransform(match.type, target.type),
      rationale: 'Name-based match'
    };
  });
}

function buildOpenQuestions(coverage, businessRules = []) {
  const questions = [];

  if (coverage.some((entry) => entry.status === 'unmapped')) {
    questions.push('Which source system fields should populate unmapped required target fields?');
  }

  if (!businessRules.length) {
    questions.push('What tolerance and exception handling rules should be applied per trading partner?');
  }

  questions.push('What are the go-live validation acceptance criteria by document type?');
  return questions;
}

export function runSpecAnalysisAgent(input) {
  const sourceFields = input.sourceSchema?.fields ?? [];
  const targetFields = input.targetSchema?.fields ?? [];
  const coverage = buildCoverage(sourceFields, targetFields);
  const mappedCount = coverage.filter((entry) => entry.status === 'mapped').length;
  const mappingCoveragePercent = targetFields.length
    ? Math.round((mappedCount / targetFields.length) * 100)
    : 0;

  const risks = [];
  if (mappingCoveragePercent < 70) {
    risks.push({
      severity: 'high',
      message: 'Low mapping coverage detected; implementation risk is elevated'
    });
  }
  if ((input.documentTypes ?? []).includes('invoice') && !(input.businessRules ?? []).length) {
    risks.push({
      severity: 'high',
      message: 'Invoice business rules are not defined'
    });
  }

  const toolContracts = [
    {
      tool: 'cleo.mapping_draft.create',
      purpose: 'Create initial CIC mapping project from approved field coverage',
      requiredInputs: ['partnerId', 'documentType', 'fieldCoverage']
    },
    {
      tool: 'ticketing.issue.create',
      purpose: 'Track unresolved mapping questions and source data dependencies',
      requiredInputs: ['projectId', 'questions', 'owner']
    },
    {
      tool: 'docs.spec.publish',
      purpose: 'Publish integration spec package for stakeholder sign-off',
      requiredInputs: ['projectId', 'specVersion', 'approvalGroup']
    }
  ];

  return {
    projectId: input.projectId,
    partnerName: input.partnerName,
    documentTypes: input.documentTypes ?? [],
    summary: {
      sourceFieldCount: sourceFields.length,
      targetFieldCount: targetFields.length,
      mappedTargetFields: mappedCount,
      mappingCoveragePercent
    },
    fieldCoverage: coverage,
    openQuestions: buildOpenQuestions(coverage, input.businessRules),
    risks,
    recommendedWorkflow: [
      'Review unmapped required fields with partner and business stakeholders',
      'Approve transformation and validation rules',
      'Lock v1 spec baseline before mapping build'
    ],
    toolContracts
  };
}

