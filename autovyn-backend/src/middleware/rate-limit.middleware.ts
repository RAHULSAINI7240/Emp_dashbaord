import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const isDevelopment = env.NODE_ENV === 'development';
const defaultWindowMs = isDevelopment ? 60 * 1000 : 15 * 60 * 1000;
const defaultMaxAttempts = isDevelopment ? 300 : 10;

export const loginRateLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS ?? defaultWindowMs,
  max: env.LOGIN_RATE_LIMIT_MAX ?? defaultMaxAttempts,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again later.',
    data: null,
    errorCode: 'LOGIN_RATE_LIMITED'
  }
});
