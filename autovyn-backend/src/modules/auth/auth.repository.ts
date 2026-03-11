import { prisma } from '../../db/prisma';

export const authRepository = {
  findByLoginId(loginId: string) {
    const normalized = loginId.trim();
    return prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { adminId: { equals: normalized, mode: 'insensitive' } },
          { employeeId: { equals: normalized, mode: 'insensitive' } }
        ]
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }]
    });
  },

  findAdminByAdminId(adminId: string) {
    const normalized = adminId.trim();
    return prisma.user.findFirst({
      where: {
        adminId: {
          equals: normalized,
          mode: 'insensitive'
        },
        role: 'ADMIN',
        isActive: true
      }
    });
  },

  findEmployeeByEmployeeId(employeeId: string) {
    const normalized = employeeId.trim();
    return prisma.user.findFirst({
      where: {
        employeeId: {
          equals: normalized,
          mode: 'insensitive'
        },
        isActive: true
      }
    });
  },

  findUserById(userId: string) {
    return prisma.user.findFirst({
      where: {
        id: userId,
        isActive: true
      }
    });
  },

  createRefreshToken(userId: string, tokenHash: string, expiresAt: Date) {
    return prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt
      }
    });
  },

  listValidRefreshTokens(userId: string) {
    return prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  },

  revokeRefreshToken(tokenId: string) {
    return prisma.refreshToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() }
    });
  }
};
