import 'dotenv/config';
import { z } from 'zod';

const normalizeOrigin = (origin: string): string => {
  const trimmed = origin.trim();
  if (!trimmed) return '';

  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
};

const parseTrustProxy = (value?: string): boolean | number | string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;

  const asNumber = Number(trimmed);
  if (Number.isInteger(asNumber) && asNumber >= 0) {
    return asNumber;
  }

  return trimmed;
};

const parseBooleanFlag = (value?: string): boolean | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;

  return undefined;
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(20),
  JWT_REFRESH_SECRET: z.string().min(20),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),
  CORS_ORIGIN: z.string().default('http://localhost:4200'),
  ARS_APPROVER_MODE: z.enum(['ADMIN', 'MANAGER', 'AUTO']).default('ADMIN'),
  TRUST_PROXY: z.string().optional(),
  BOOTSTRAP_CORE_USERS: z.string().optional(),
  BOOTSTRAP_ADMIN_LOGIN_ID: z.string().trim().min(3).optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(1).optional(),
  BOOTSTRAP_HR_LOGIN_ID: z.string().trim().min(3).optional(),
  BOOTSTRAP_HR_PASSWORD: z.string().min(1).optional(),
  BOOTSTRAP_MANAGER_LOGIN_ID: z.string().trim().min(3).optional(),
  BOOTSTRAP_MANAGER_PASSWORD: z.string().min(1).optional(),
  DEMO_LOGIN_ID: z.string().trim().min(3).optional(),
  DEMO_PASSWORD: z.string().min(1).optional(),
  DEMO_ROLE: z.enum(['ADMIN', 'EMPLOYEE', 'HR']).optional(),
  DEMO_NAME: z.string().trim().min(1).optional(),
  DEMO_DESIGNATION: z.string().trim().min(1).optional(),
  DEMO_CITY: z.string().trim().min(1).optional(),
  DEMO_JOINING_DATE: z.string().trim().optional(),
  DEMO_WORK_MODE: z.enum(['WFO', 'WFH', 'HYBRID']).optional(),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().optional(),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().optional()
});

export const env = envSchema.parse(process.env);

export const corsOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => normalizeOrigin(origin))
  .filter(Boolean);

export const trustProxy = parseTrustProxy(env.TRUST_PROXY) ?? (env.NODE_ENV === 'production' ? 1 : false);

export const bootstrapCoreUsersEnabled = parseBooleanFlag(env.BOOTSTRAP_CORE_USERS) ?? false;
