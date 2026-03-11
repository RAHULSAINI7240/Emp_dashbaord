import { z } from 'zod';

export const objectIdRegex = /^[a-f\d]{24}$/i;

export const objectIdSchema = z.string().regex(objectIdRegex, 'Invalid MongoDB ObjectId.');
