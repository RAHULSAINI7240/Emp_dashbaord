import { Response } from 'express';

export const sendSuccess = <T>(res: Response, message: string, data: T, statusCode = 200): Response => {
  return res.status(statusCode).json({
    success: true,
    message,
    data
  });
};

export const sendFailure = (
  res: Response,
  message: string,
  errorCode: string,
  statusCode = 400,
  details?: unknown
): Response => {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    errorCode,
    ...(details ? { details } : {})
  });
};
