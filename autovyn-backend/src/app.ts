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

const isAllowedLocalDevOrigin = (origin: string): boolean => {
  if (env.NODE_ENV !== 'development') return false;

  try {
    const parsed = new URL(origin);
    return (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
    );
  } catch {
    return false;
  }
};

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin) || isAllowedLocalDevOrigin(origin)) {
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
