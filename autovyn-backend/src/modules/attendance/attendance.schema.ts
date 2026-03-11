import { z } from 'zod';

export const punchActionSchema = z.object({
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional()
});

export const attendanceMonthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional()
});

export const attendanceDayQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional()
});

export const attendanceReportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  employeeId: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  timezoneOffsetMinutes: z.coerce.number().int().min(-840).max(840).optional()
});
