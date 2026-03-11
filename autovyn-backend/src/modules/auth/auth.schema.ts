import { z } from 'zod';

export const loginSchema = z.object({
  loginId: z.string().trim().min(3),
  password: z.string().min(1)
});

export const adminLoginSchema = z.object({
  adminId: z.string().trim().min(3),
  password: z.string().min(1)
});

export const employeeLoginSchema = z.object({
  employeeId: z.string().trim().min(3),
  password: z.string().min(1)
});

export const tokenSchema = z.object({
  refreshToken: z.string().min(20)
});
