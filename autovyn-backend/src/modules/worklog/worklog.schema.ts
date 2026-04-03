import { z } from 'zod';

export const worklogHeartbeatSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
  durationSeconds: z.coerce.number().int().min(10).max(600),
  recordedAt: z.string().datetime().optional(),
  deviceId: z.string().trim().min(1).max(120).optional(),
  editor: z.string().trim().min(2).max(40).optional(),
  isFocused: z.coerce.boolean().optional()
});

export const worklogPresenceSchema = z.object({
  status: z.enum(['ACTIVE', 'IDLE', 'OFFLINE']),
  recordedAt: z.string().datetime().optional(),
  deviceId: z.string().trim().min(1).max(120).optional(),
  editor: z.string().trim().min(2).max(40).optional(),
  isFocused: z.coerce.boolean().optional()
});

export const worklogSummaryQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeId: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional()
});
