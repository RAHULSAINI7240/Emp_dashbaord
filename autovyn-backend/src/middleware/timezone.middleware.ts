import { NextFunction, Request, Response } from 'express';
import { parseTimezoneOffset } from '../utils/date-time';

export const timezoneMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  const headerValue = req.header('x-timezone-offset');
  const queryValue = req.query.timezoneOffsetMinutes;

  try {
    req.timezoneOffsetMinutes = parseTimezoneOffset(headerValue ?? queryValue);
    next();
  } catch (error) {
    next(error);
  }
};
