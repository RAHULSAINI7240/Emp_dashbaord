import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import routes from './routes';
import { corsOrigins, env } from './config/env';
import { timezoneMiddleware } from './middleware/timezone.middleware';
import { notFoundMiddleware } from './middleware/not-found.middleware';
import { errorMiddleware } from './middleware/error.middleware';

export const app = express();

app.disable('x-powered-by');
app.use(helmet());

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
      if (!origin || corsOrigins.includes(origin) || isAllowedDevelopmentOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Not allowed by CORS'));
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
