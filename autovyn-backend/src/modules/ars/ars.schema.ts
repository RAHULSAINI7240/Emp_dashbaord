import { RequestStatus } from '@prisma/client';
import { z } from 'zod';
import { objectIdSchema } from '../../utils/object-id';

export const arsRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  missingType: z.enum(['MISSING_IN', 'MISSING_OUT', 'BOTH', 'MISSING_PUNCH_IN', 'MISSING_PUNCH_OUT']),
  reason: z.string().trim().min(5).max(500),
  approverId: objectIdSchema.optional()
});

export const arsMyQuerySchema = z.object({
  status: z.nativeEnum(RequestStatus).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
});

export const arsApprovalsQuerySchema = z.object({
  status: z.nativeEnum(RequestStatus).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
});

export const arsApproveSchema = z.object({
  correctedPunchIn: z.string().datetime().optional(),
  correctedPunchOut: z.string().datetime().optional(),
  comment: z.string().trim().max(500).optional()
});

export const arsDeclineSchema = z.object({
  comment: z.string().trim().max(500).optional()
});
