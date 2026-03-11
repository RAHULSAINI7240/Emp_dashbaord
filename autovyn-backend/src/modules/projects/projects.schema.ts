import { z } from 'zod';
import { objectIdSchema } from '../../utils/object-id';

const lineListSchema = z.array(z.string().trim().min(1).max(120)).max(12);

export const projectCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  client: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(10).max(1200),
  category: z.string().trim().min(2).max(60),
  status: z.string().trim().min(2).max(40),
  teamName: z.string().trim().min(2).max(120).optional(),
  frontendStack: z.string().trim().min(2).max(120).optional(),
  backendStack: z.string().trim().min(2).max(120).optional(),
  qaSummary: z.string().trim().min(2).max(160).optional(),
  supportSummary: z.string().trim().min(2).max(160).optional(),
  modules: lineListSchema.default([]),
  highlights: lineListSchema.default([]),
  memberIds: z.array(objectIdSchema).min(1).max(30),
  memberRoles: z.record(objectIdSchema, z.string().trim().min(2).max(80)).optional()
});

export const projectUpdateSchema = projectCreateSchema;

export const projectIdParamsSchema = z.object({
  id: objectIdSchema
});
