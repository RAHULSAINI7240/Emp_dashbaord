import { z } from 'zod';

export const announcementCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(5000),
  imageUrl: z.string().trim().url().optional()
});

export const announcementListQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
});
