import { z } from 'zod';

export const holidayCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(2).max(200),
  imageUrl: z.string().trim().url().optional()
});

export const holidayListQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100)
});
