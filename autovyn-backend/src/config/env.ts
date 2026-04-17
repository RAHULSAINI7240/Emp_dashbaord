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

const DEFAULT_CORS_ORIGINS = ['http://localhost:4200', 'https://emp-dashboard-frontend.onrender.com'].map(
  (origin) => normalizeOrigin(origin)
);

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

const parseCorsOrigins = (value?: string): string[] => {
  const source = value?.trim() ? value : DEFAULT_CORS_ORIGINS.join(',');
  const origins = source
    .split(',')
    .map((origin) => normalizeOrigin(origin))
    .filter(Boolean);

  return origins.length ? origins : DEFAULT_CORS_ORIGINS;
};

const isPrivateIpv4Hostname = (hostname: string): boolean => {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;

  const octets = hostname.split('.').map(Number);
  if (octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
};

const isLikelyLocalOrigin = (origin: string): boolean => {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || isPrivateIpv4Hostname(hostname);
  } catch {
    return false;
  }
};

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(20),
  JWT_REFRESH_SECRET: z.string().min(20),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('3650d'),
  SCREENSHOT_RETENTION_DAYS: z.coerce.number().int().min(1).max(30).default(2),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),
  CORS_ORIGIN: z.string().optional(),
  ARS_APPROVER_MODE: z.enum(['ADMIN', 'MANAGER', 'AUTO']).default('ADMIN'),
  TRUST_PROXY: z.string().optional(),
  BOOTSTRAP_CORE_USERS: z.string().optional(),
  BOOTSTRAP_CORE_USERS_MODE: z.enum(['ALWAYS', 'EMPTY_DB']).optional(),
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

export const corsOrigins = parseCorsOrigins(env.CORS_ORIGIN);

if (env.NODE_ENV === 'production' && corsOrigins.every((origin) => isLikelyLocalOrigin(origin))) {
  console.warn(
    'CORS_ORIGIN only contains localhost/private-network origins in production. Add your deployed frontend URL to avoid browser CORS failures.'
  );
}

export const trustProxy = parseTrustProxy(env.TRUST_PROXY) ?? (env.NODE_ENV === 'production' ? 1 : false);

type BootstrapCoreUsersMode = 'DISABLED' | 'ALWAYS' | 'EMPTY_DB';

const resolveBootstrapCoreUsersMode = (): BootstrapCoreUsersMode => {
  const explicitFlag = parseBooleanFlag(env.BOOTSTRAP_CORE_USERS);
  if (explicitFlag === false) return 'DISABLED';
  if (explicitFlag === true) return 'ALWAYS';
  return env.BOOTSTRAP_CORE_USERS_MODE ?? 'EMPTY_DB';
};

export const bootstrapCoreUsersMode = resolveBootstrapCoreUsersMode();
export const bootstrapCoreUsersEnabled = bootstrapCoreUsersMode !== 'DISABLED';
