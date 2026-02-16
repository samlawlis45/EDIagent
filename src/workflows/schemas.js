import { z } from 'zod';

const fieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  required: z.boolean().optional()
});

const mappingIntentSchema = z.object({
  sourceField: z.string().min(1),
  targetField: z.string().min(1),
  transform: z.string().optional(),
  required: z.boolean().optional(),
  defaultValue: z.string().optional(),
  validation: z.string().optional()
});

const testResultSchema = z.object({
  caseId: z.string().min(1),
  status: z.enum(['pass', 'fail', 'blocked']),
  severity: z.enum(['low', 'medium', 'high']).optional()
});

const certificationCriterionSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().optional(),
  met: z.boolean()
});

const checklistItemSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['complete', 'in_progress', 'not_started']),
  owner: z.string().optional(),
  required: z.boolean().optional()
});

const approvalSchema = z.object({
  group: z.string().min(1),
  status: z.enum(['approved', 'pending', 'rejected']),
  required: z.boolean().optional()
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

export const runWorkflowSchema = z.object({
  adapter: z.string().min(1),
  workflow: z.literal('new_partner_implementation'),
  input: z.object({
    projectId: z.string().min(1),
    projectName: z.string().min(1),
    partnerName: z.string().min(1),
    partnerId: z.string().min(1),
    connectionType: z.enum(['AS2', 'SFTP', 'API', 'VAN']).optional(),
    documentType: z.string().default('invoice'),
    targetDocumentTypes: z.array(z.enum(['purchase_order', 'invoice', 'shipment_notice', 'unknown'])).default(['purchase_order', 'invoice']),
    businessRules: z.array(z.string()).default([]),
    sourceSchema: z.object({
      system: z.string().optional(),
      fields: z.array(fieldSchema).default([])
    }),
    targetSchema: z.object({
      system: z.string().optional(),
      fields: z.array(fieldSchema).default([])
    }),
    mappingIntent: z.array(mappingIntentSchema).default([]),
    test: z.object({
      results: z.array(testResultSchema).default([]),
      certificationCriteria: z.array(certificationCriterionSchema).default([]),
      defectSummary: z.object({
        openCritical: z.number().int().nonnegative().default(0),
        openHigh: z.number().int().nonnegative().default(0),
        openMedium: z.number().int().nonnegative().default(0)
      }).default({ openCritical: 0, openHigh: 0, openMedium: 0 }),
      partnerCertification: z.object({
        required: z.boolean().optional(),
        status: z.enum(['pending', 'approved', 'rejected'])
      }).optional()
    }).default({}),
    deployment: z.object({
      environment: z.string().default('production'),
      checklist: z.array(checklistItemSchema).default([]),
      approvals: z.array(approvalSchema).default([])
    }).default({}),
    standards: z.object({
      artifacts: z.array(z.object({
        type: z.enum(['mapping', 'spec', 'workflow', 'deployment', 'monitoring']),
        name: z.string().min(1),
        metadata: z.record(z.string(), z.unknown()).optional()
      })).default([]),
      checklist: z.array(z.object({
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
    }).default({}),
    program: z.object({
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
    }).default({}),
    postProduction: z.object({
      enabled: z.boolean().default(false),
      incidentId: z.string().optional(),
      severity: z.enum(['P1', 'P2', 'P3', 'P4']).optional(),
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
    }).default({ enabled: false }),
    execution: z.object({
      approvalMode: z.enum(['propose_only', 'execute']).default('propose_only'),
      executeTools: z.boolean().default(false),
      enabledTools: z.array(z.string()).default([]),
      approvals: z.array(z.object({
        scope: z.enum(['workflow_execute', 'deployment_execute', 'post_production_escalation_execute']),
        group: z.string().min(1),
        required: z.boolean().optional(),
        status: z.enum(['approved', 'pending', 'rejected'])
      })).default([])
    }).default({})
  })
});
