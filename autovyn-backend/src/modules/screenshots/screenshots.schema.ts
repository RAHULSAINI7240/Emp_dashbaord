import { z } from 'zod';

const screenshotItem = z.object({
  imageData: z
    .string()
    .min(100)
    .max(4_000_000)
    .refine(
      (value) => value.startsWith('data:image/'),
      { message: 'imageData must be a valid data URL (data:image/...)' }
    ),
  deviceId: z.string().trim().min(1).max(120).optional(),
  capturedAt: z.string().datetime()
});

export const screenshotUploadSchema = screenshotItem;

export const screenshotBatchUploadSchema = z.object({
  screenshots: z.array(screenshotItem).min(1).max(50)
});

export const screenshotListQuerySchema = z.object({
  userId: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const screenshotRecentQuerySchema = z.object({
  userId: z.string().trim().min(1),
  days: z.coerce.number().int().min(1).max(30).default(2)
});

export const screenshotStreamQuerySchema = z.object({
  userId: z.string().trim().min(1),
  days: z.coerce.number().int().min(1).max(30).default(2)
});
