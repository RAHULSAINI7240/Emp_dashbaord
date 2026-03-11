import { User } from '@prisma/client';
import { AppError } from '../../utils/app-error';
import { comparePassword, hashPassword } from '../../utils/password';
import { getTokenExpiryDate, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { authRepository } from './auth.repository';

const serializeUser = (user: User) => ({
  id: user.id,
  employeeId: user.employeeId,
  adminId: user.adminId,
  name: user.name,
  email: user.email,
  phone: user.phone,
  department: user.department,
  profilePhotoUrl: user.profilePhotoUrl,
  dateOfBirth: user.dateOfBirth,
  gender: user.gender,
  bloodGroup: user.bloodGroup,
  emergencyContact: user.emergencyContact,
  address: user.address,
  designation: user.designation,
  city: user.city,
  workMode: user.workMode,
  role: user.role,
  permissions: user.permissions,
  managerId: user.managerId,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

const issueTokens = async (user: User): Promise<{ accessToken: string; refreshToken: string }> => {
  const basePayload = {
    sub: user.id,
    role: user.role,
    permissions: user.permissions,
    employeeId: user.employeeId,
    adminId: user.adminId
  };

  const accessToken = signAccessToken(basePayload);
  const refreshToken = signRefreshToken(basePayload);
  const refreshTokenHash = await hashPassword(refreshToken);
  const expiresAt = getTokenExpiryDate(refreshToken);

  await authRepository.createRefreshToken(user.id, refreshTokenHash, expiresAt);

  return { accessToken, refreshToken };
};

export const authService = {
  async login(loginId: string, password: string) {
    const users = await authRepository.findByLoginId(loginId.trim());
    if (!users.length) {
      throw new AppError('Invalid credentials.', 401, 'INVALID_CREDENTIALS');
    }

    // Safety guard in case both adminId and employeeId accidentally share same value.
    if (users.length > 1) {
      throw new AppError(
        'Ambiguous loginId is mapped to multiple users. Contact admin.',
        409,
        'AMBIGUOUS_LOGIN_ID'
      );
    }

    const user = users[0];
    const validPassword = await comparePassword(password, user.passwordHash);
    if (!validPassword) {
      throw new AppError('Invalid credentials.', 401, 'INVALID_CREDENTIALS');
    }

    const tokens = await issueTokens(user);
    return {
      ...tokens,
      user: serializeUser(user)
    };
  },

  async loginAdmin(adminId: string, password: string) {
    const user = await authRepository.findAdminByAdminId(adminId);
    if (!user) {
      throw new AppError('Invalid admin credentials.', 401, 'INVALID_ADMIN_CREDENTIALS');
    }

    const validPassword = await comparePassword(password, user.passwordHash);
    if (!validPassword) {
      throw new AppError('Invalid admin credentials.', 401, 'INVALID_ADMIN_CREDENTIALS');
    }

    const tokens = await issueTokens(user);
    return {
      ...tokens,
      user: serializeUser(user)
    };
  },

  async loginEmployee(employeeId: string, password: string) {
    const user = await authRepository.findEmployeeByEmployeeId(employeeId);
    if (!user) {
      throw new AppError('Invalid employee credentials.', 401, 'INVALID_EMPLOYEE_CREDENTIALS');
    }

    const validPassword = await comparePassword(password, user.passwordHash);
    if (!validPassword) {
      throw new AppError('Invalid employee credentials.', 401, 'INVALID_EMPLOYEE_CREDENTIALS');
    }

    const tokens = await issueTokens(user);
    return {
      ...tokens,
      user: serializeUser(user)
    };
  },

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    const user = await authRepository.findUserById(payload.sub);

    if (!user) {
      throw new AppError('User not found for refresh token.', 401, 'REFRESH_USER_NOT_FOUND');
    }

    const validStoredTokens = await authRepository.listValidRefreshTokens(user.id);

    let matchedTokenId: string | null = null;
    for (const stored of validStoredTokens) {
      const match = await comparePassword(refreshToken, stored.tokenHash);
      if (match) {
        matchedTokenId = stored.id;
        break;
      }
    }

    if (!matchedTokenId) {
      throw new AppError('Refresh token revoked or not recognized.', 401, 'REFRESH_TOKEN_REVOKED');
    }

    await authRepository.revokeRefreshToken(matchedTokenId);

    const tokens = await issueTokens(user);

    return {
      ...tokens,
      user: serializeUser(user)
    };
  },

  async logout(refreshToken: string) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      const validStoredTokens = await authRepository.listValidRefreshTokens(payload.sub);

      for (const stored of validStoredTokens) {
        const match = await comparePassword(refreshToken, stored.tokenHash);
        if (match) {
          await authRepository.revokeRefreshToken(stored.id);
          break;
        }
      }
    } catch {
      // intentionally ignore invalid token on logout for idempotent behavior
    }
  }
};
