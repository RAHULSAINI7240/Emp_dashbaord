import { LeaveType, RequestStatus } from '@prisma/client';
import { z } from 'zod';
import { objectIdSchema } from '../../utils/object-id';

export const leaveRequestSchema = z.object({
  approverId: objectIdSchema,
  type: z.nativeEnum(LeaveType),
  duration: z.enum(['FULL_DAY', 'HALF_DAY']).default('FULL_DAY'),
  halfDaySession: z.enum(['FIRST_HALF', 'SECOND_HALF']).optional(),
  reason: z.string().trim().min(5).max(500),
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1)
}).superRefine((value, ctx) => {
  if (value.duration === 'HALF_DAY') {
    if (!value.halfDaySession) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['halfDaySession'], message: 'Half-day session is required.' });
    }
    if (value.dates.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dates'], message: 'Half-day leave allows only one date.' });
    }
  }

  if (value.duration === 'FULL_DAY' && value.halfDaySession) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['halfDaySession'], message: 'Half-day session is only for half-day leave.' });
  }
});

export const leaveListMyQuerySchema = z.object({
  status: z.nativeEnum(RequestStatus).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
});

export const leaveApprovalsQuerySchema = z.object({
  status: z.nativeEnum(RequestStatus).optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
});

export const leaveActionSchema = z.object({
  comment: z.string().trim().min(1).max(500).optional()
});
