import { z } from 'zod';
import { objectIdSchema } from '../../utils/object-id';

export const credentialCreateSchema = z.object({
  ownerUserId: objectIdSchema,
  systemName: z.string().trim().min(2).max(120),
  credentialLabel: z.string().trim().min(2).max(160),
  loginId: z.string().trim().min(2).max(200),
  password: z.string().trim().min(2).max(200),
  accessUrl: z.string().trim().url().optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal(''))
});

export const credentialUpdateSchema = credentialCreateSchema;

export const credentialIdParamsSchema = z.object({
  id: objectIdSchema
});
