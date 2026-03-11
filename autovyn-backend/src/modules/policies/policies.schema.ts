import { z } from 'zod';

const leaveAllowancesSchema = z.object({
  casual: z.number().min(0).max(365),
  sick: z.number().min(0).max(365),
  special: z.number().min(0).max(365),
  emergency: z.number().min(0).max(365)
});

export const policiesUpsertSchema = z.object({
  attendancePolicy: z.string().trim().min(10),
  leavePolicy: z.string().trim().min(10),
  leaveAllowances: leaveAllowancesSchema.optional()
});
