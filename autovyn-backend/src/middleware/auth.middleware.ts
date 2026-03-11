import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { AppError } from '../utils/app-error';
import { verifyAccessToken } from '../utils/jwt';

export const authenticate = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.header('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError('Missing bearer token.', 401, 'AUTH_HEADER_MISSING');
    }

    const token = authHeader.slice(7).trim();
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        permissions: true,
        employeeId: true,
        adminId: true,
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      throw new AppError('User is inactive or not found.', 401, 'USER_INACTIVE_OR_NOT_FOUND');
    }

    req.auth = {
      userId: user.id,
      role: user.role,
      permissions: user.permissions,
      employeeId: user.employeeId,
      adminId: user.adminId
    };

    next();
  } catch (error) {
    next(error);
  }
};
