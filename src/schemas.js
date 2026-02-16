import { z } from 'zod';

const canonicalDocTypes = ['purchase_order', 'invoice', 'shipment_notice', 'unknown'];

const runOnboardingSchema = z.object({
  adapter: z.string().min(1),
  agent: z.literal('onboarding'),
  input: z.object({
    partnerName: z.string().min(1),
    connectionType: z.enum(['AS2', 'SFTP', 'API', 'VAN']).optional(),
    targetDocumentTypes: z.array(z.enum(canonicalDocTypes)).optional(),
    requiredCapabilities: z.array(z.string()).optional(),
    existingCapabilities: z.array(z.string()).optional()
  })
});

const runSpecAnalysisSchema = z.object({
  adapter: z.string().min(1),
  agent: z.literal('spec_analysis'),
  input: z.object({
    projectId: z.string().min(1),
    partnerName: z.string().min(1),
    documentTypes: z.array(z.string()).default([]),
    businessRules: z.array(z.string()).default([]),
    sourceSchema: z.object({
      system: z.string().optional(),
      fields: z.array(z.object({
        name: z.string().min(1),
        type: z.string().optional()
      })).default([])
    }),
    targetSchema: z.object({
      system: z.string().optional(),
      fields: z.array(z.object({
        name: z.string().min(1),
        type: z.string().optional(),
        required: z.boolean().optional()
      })).default([])
    })
  })
});

const runMappingEngineerSchema = z.object({
  adapter: z.string().min(1),
  agent: z.literal('mapping_engineer'),
  input: z.object({
    projectId: z.string().min(1),
    partnerId: z.string().min(1),
    documentType: z.string().min(1),
    mappingIntent: z.array(z.object({
      sourceField: z.string().min(1),
      targetField: z.string().min(1),
      transform: z.string().optional(),
      required: z.boolean().optional(),
      defaultValue: z.string().optional(),
      validation: z.string().optional()
    })).default([])
  })
});

const runDeploymentReadinessSchema = z.object({
  adapter: z.string().min(1),
  agent: z.literal('deployment_readiness'),
  input: z.object({
    projectId: z.string().min(1),
    environment: z.string().min(1),
    checklist: z.array(z.object({
      name: z.string().min(1),
      status: z.enum(['complete', 'in_progress', 'not_started']),
      owner: z.string().optional(),
      required: z.boolean().optional()
    })).default([]),
    approvals: z.array(z.object({
      group: z.string().min(1),
      status: z.enum(['approved', 'pending', 'rejected']),
      required: z.boolean().optional()
    })).default([])
  })
});

const milestoneSchema = z.object({
  name: z.string().min(1),
  dueDate: z.string().optional(),
  owner: z.string().optional(),
  status: z.enum(['not_started', 'in_progress', 'complete', 'blocked'])
});

const riskSchema = z.object({
  title: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high']),
  status: z.enum(['open', 'mitigating', 'closed']),
  mitigation: z.string().optional()
});

const dependencySchema = z.object({
  name: z.string().min(1),
  owner: z.string().optional(),
  status: z.enum(['ready', 'in_progress', 'blocked'])
});

const runIntegrationProgramSchema = z.object({
  adapter: z.string().min(1),
  agent: z.literal('integration_program'),
  input: z.object({
    projectId: z.string().min(1),
    projectName: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    budget: z.number().nonnegative().optional(),
    timeline: z.object({
      startDate: z.string().optional(),
      targetGoLive: z.string().optional()
    }).optional(),
    milestones: z.array(milestoneSchema).default([]),
    risks: z.array(riskSchema).default([]),
    dependencies: z.array(dependencySchema).default([]),
    stakeholders: z.array(z.object({
      name: z.string().min(1),
      role: z.string().optional(),
      team: z.string().optional()
    })).default([])
  })
});

const runTestCertificationSchema = z.object({
  adapter: z.string().min(1),
  agent: z.literal('test_certification'),
  input: z.object({
    projectId: z.string().min(1),
    documentType: z.string().min(1),
    testResults: z.array(z.object({
      caseId: z.string().min(1),
      status: z.enum(['pass', 'fail', 'blocked']),
      severity: z.enum(['low', 'medium', 'high']).optional()
    })).default([]),
    certificationCriteria: z.array(z.object({
      name: z.string().min(1),
      required: z.boolean().optional(),
      met: z.boolean()
    })).default([]),
    defectSummary: z.object({
      openCritical: z.number().int().nonnegative().default(0),
      openHigh: z.number().int().nonnegative().default(0),
      openMedium: z.number().int().nonnegative().default(0)
    }).default({ openCritical: 0, openHigh: 0, openMedium: 0 }),
    partnerCertification: z.object({
      required: z.boolean().optional(),
      status: z.enum(['pending', 'approved', 'rejected'])
    }).optional()
  })
});

const runPostProductionEscalationSchema = z.object({
  adapter: z.string().min(1),
  agent: z.literal('post_production_escalation'),
  input: z.object({
    incidentId: z.string().min(1),
    projectId: z.string().optional(),
    severity: z.enum(['P1', 'P2', 'P3', 'P4']),
    symptoms: z.array(z.string()).default([]),
    affectedPartners: z.array(z.string()).default([]),
    runbookSteps: z.array(z.object({
      name: z.string().min(1),
      status: z.enum(['pending', 'complete', 'skipped'])
    })).default([]),
    recentChanges: z.array(z.string()).default([]),
    metrics: z.array(z.object({
      name: z.string().min(1),
      value: z.number(),
      threshold: z.number(),
      direction: z.enum(['above_is_bad', 'below_is_bad'])
    })).default([])
  })
});

const runStandardsArchitectureSchema = z.object({
  adapter: z.string().min(1),
  agent: z.literal('standards_architecture'),
  input: z.object({
    projectId: z.string().min(1),
    artifacts: z.array(z.object({
      type: z.enum(['mapping', 'spec', 'workflow', 'deployment', 'monitoring']),
      name: z.string().min(1),
      metadata: z.record(z.string(), z.unknown()).optional()
    })).default([]),
    standardsChecklist: z.array(z.object({
      ruleId: z.string().min(1),
      description: z.string().min(1),
      severity: z.enum(['must', 'should']),
      passed: z.boolean(),
      notes: z.string().optional()
    })).default([]),
    architectureDecisions: z.array(z.object({
      decision: z.string().min(1),
      status: z.enum(['proposed', 'approved', 'deprecated']),
      rationale: z.string().optional()
    })).default([]),
    reuseTargets: z.array(z.string()).default([])
  })
});

export const runAgentSchema = z.discriminatedUnion('agent', [
  runOnboardingSchema,
  runSpecAnalysisSchema,
  runMappingEngineerSchema,
  runDeploymentReadinessSchema,
  runIntegrationProgramSchema,
  runTestCertificationSchema,
  runPostProductionEscalationSchema,
  runStandardsArchitectureSchema
]);
