import { NextFunction, Request, Response } from 'express';
import { Permission, Role } from '@prisma/client';
import { AppError } from '../utils/app-error';

export const requireRoles = (...roles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
      return;
    }

    if (!roles.includes(auth.role)) {
      next(new AppError('Access denied for this role.', 403, 'FORBIDDEN_ROLE'));
      return;
    }

    next();
  };
};

export const requireAnyPermission = (...permissions: Permission[]) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = req.auth;
    if (!auth) {
      next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
      return;
    }

    if (auth.role === 'ADMIN') {
      next();
      return;
    }

    const hasPermission = permissions.some((permission) => auth.permissions.includes(permission));
    if (!hasPermission) {
      next(new AppError('Missing required permission.', 403, 'FORBIDDEN_PERMISSION'));
      return;
    }

    next();
  };
};

export const requireAdmin = (req: Request, _res: Response, next: NextFunction): void => {
  const auth = req.auth;
  if (!auth) {
    next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    return;
  }

  if (auth.role !== 'ADMIN') {
    next(new AppError('Admin access required.', 403, 'ADMIN_ONLY'));
    return;
  }

  next();
};
