import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from '../utils/app-error';
import { sendFailure } from '../utils/api-response';

export const errorMiddleware = (
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  if (error instanceof AppError) {
    return sendFailure(res, error.message, error.errorCode, error.statusCode, error.details);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return sendFailure(res, 'Duplicate value violates unique constraint.', 'DUPLICATE_RESOURCE', 409, error.meta);
    }

    return sendFailure(res, 'Database request failed.', 'DATABASE_ERROR', 500, {
      code: error.code,
      meta: error.meta
    });
  }

  if (error instanceof Error) {
    return sendFailure(
      res,
      env.NODE_ENV === 'production' ? 'Unexpected server error.' : error.message,
      'INTERNAL_SERVER_ERROR',
      500
    );
  }

  return sendFailure(res, 'Unexpected server error.', 'INTERNAL_SERVER_ERROR', 500);
};
