import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodTypeAny } from 'zod';
import { AppError } from '../utils/app-error';

export const validate = (schema: ZodTypeAny, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        next(new AppError('Validation failed.', 400, 'VALIDATION_ERROR', error.flatten()));
        return;
      }
      next(error);
    }
  };
};
