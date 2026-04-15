import { z } from 'zod';

export const screenshotUploadSchema = z.object({
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

export const screenshotListQuerySchema = z.object({
  userId: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});
