import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

const credentialInclude = {
  owner: {
    select: {
      id: true,
      name: true,
      employeeId: true,
      adminId: true
    }
  },
  createdBy: {
    select: {
      id: true,
      name: true,
      employeeId: true,
      adminId: true
    }
  }
} satisfies Prisma.CredentialInclude;

export const credentialsRepository = {
  listVisible(ownerUserId?: string) {
    return prisma.credential.findMany({
      where: ownerUserId ? { ownerUserId } : {},
      orderBy: [{ updatedAt: 'desc' }],
      include: credentialInclude
    });
  },

  findById(id: string) {
    return prisma.credential.findUnique({
      where: { id },
      include: credentialInclude
    });
  },

  create(data: Prisma.CredentialUncheckedCreateInput) {
    return prisma.credential.create({
      data,
      include: credentialInclude
    });
  },

  update(id: string, data: Prisma.CredentialUncheckedUpdateInput) {
    return prisma.credential.update({
      where: { id },
      data,
      include: credentialInclude
    });
  },

  delete(id: string) {
    return prisma.credential.delete({
      where: { id }
    });
  }
};
