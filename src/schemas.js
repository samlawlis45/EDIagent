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

const runInvoiceAnomalySchema = z.object({
  adapter: z.string().min(1),
  agent: z.literal('invoice_anomaly'),
  input: z.object({
    invoice: z.unknown(),
    purchaseOrder: z.unknown().optional(),
    shipmentNotice: z.unknown().optional(),
    tolerance: z.object({
      amountPercent: z.number().nonnegative().optional(),
      quantityPercent: z.number().nonnegative().optional()
    }).optional()
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

export const runAgentSchema = z.discriminatedUnion('agent', [
  runOnboardingSchema,
  runInvoiceAnomalySchema,
  runSpecAnalysisSchema,
  runMappingEngineerSchema,
  runDeploymentReadinessSchema
]);
