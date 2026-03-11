import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import type { Secret, SignOptions } from 'jsonwebtoken';
import { Permission, Role } from '@prisma/client';
import { env } from '../config/env';
import { AppError } from './app-error';

export interface AuthTokenPayload {
  sub: string;
  role: Role;
  permissions: Permission[];
  employeeId: string | null;
  adminId: string | null;
  tokenType: 'access' | 'refresh';
  jti?: string;
}

const ACCESS_SECRET: Secret = env.JWT_ACCESS_SECRET;
const REFRESH_SECRET: Secret = env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES_IN = env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'];
const REFRESH_EXPIRES_IN = env.JWT_REFRESH_EXPIRES_IN as SignOptions['expiresIn'];

export const signAccessToken = (payload: Omit<AuthTokenPayload, 'tokenType' | 'jti'>): string =>
  jwt.sign({ ...payload, tokenType: 'access' }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });

export const signRefreshToken = (payload: Omit<AuthTokenPayload, 'tokenType' | 'jti'>): string =>
  jwt.sign(
    {
      ...payload,
      tokenType: 'refresh',
      jti: crypto.randomUUID()
    },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );

const assertPayload = (decoded: string | JwtPayload): AuthTokenPayload => {
  if (!decoded || typeof decoded === 'string') {
    throw new AppError('Invalid token payload.', 401, 'INVALID_TOKEN');
  }

  if (typeof decoded.sub !== 'string') {
    throw new AppError('Invalid token subject.', 401, 'INVALID_TOKEN_SUBJECT');
  }

  if (!Array.isArray(decoded.permissions)) {
    throw new AppError('Invalid token permissions.', 401, 'INVALID_TOKEN_PERMISSIONS');
  }

  return {
    sub: decoded.sub,
    role: decoded.role as Role,
    permissions: decoded.permissions as Permission[],
    employeeId: (decoded.employeeId as string | null) ?? null,
    adminId: (decoded.adminId as string | null) ?? null,
    tokenType: decoded.tokenType as 'access' | 'refresh',
    jti: decoded.jti as string | undefined
  };
};

export const verifyAccessToken = (token: string): AuthTokenPayload => {
  try {
    const payload = assertPayload(jwt.verify(token, ACCESS_SECRET));
    if (payload.tokenType !== 'access') {
      throw new AppError('Invalid token type.', 401, 'INVALID_ACCESS_TOKEN');
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Access token is invalid or expired.', 401, 'ACCESS_TOKEN_INVALID');
  }
};

export const verifyRefreshToken = (token: string): AuthTokenPayload => {
  try {
    const payload = assertPayload(jwt.verify(token, REFRESH_SECRET));
    if (payload.tokenType !== 'refresh') {
      throw new AppError('Invalid token type.', 401, 'INVALID_REFRESH_TOKEN');
    }
    return payload;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Refresh token is invalid or expired.', 401, 'REFRESH_TOKEN_INVALID');
  }
};

export const getTokenExpiryDate = (token: string): Date => {
  const decoded = jwt.decode(token) as JwtPayload | null;
  if (!decoded?.exp) {
    throw new AppError('Token expiry is missing.', 401, 'TOKEN_EXPIRY_MISSING');
  }
  return new Date(decoded.exp * 1000);
};
