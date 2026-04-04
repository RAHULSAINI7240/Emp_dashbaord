import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes';
import { corsOrigins, env, trustProxy } from './config/env';
import { timezoneMiddleware } from './middleware/timezone.middleware';
import { notFoundMiddleware } from './middleware/not-found.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { AppError } from './utils/app-error';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', trustProxy);
app.use(helmet());

const normalizeOrigin = (origin: string): string => {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.trim().replace(/\/+$/, '');
  }
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

const isAllowedDevelopmentOrigin = (origin: string): boolean => {
  if (env.NODE_ENV !== 'development') {
    return false;
  }

  try {
    const parsed = new URL(origin);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1' ||
      isPrivateIpv4Hostname(parsed.hostname)
    );
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin(origin, callback) {
      const normalizedOrigin = origin ? normalizeOrigin(origin) : origin;
      if (!normalizedOrigin || corsOrigins.includes(normalizedOrigin) || isAllowedDevelopmentOrigin(normalizedOrigin)) {
        callback(null, true);
        return;
      }
      callback(
        new AppError('Origin not allowed by CORS.', 403, 'CORS_ORIGIN_NOT_ALLOWED', {
          origin: normalizedOrigin
        })
      );
    },
    credentials: false
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(timezoneMiddleware);
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/api', routes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);
