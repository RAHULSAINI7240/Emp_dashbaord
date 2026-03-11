import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

export const announcementsRepository = {
  create(data: Prisma.AnnouncementUncheckedCreateInput) {
    return prisma.announcement.create({
      data,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            adminId: true,
            employeeId: true
          }
        }
      }
    });
  },

  count() {
    return prisma.announcement.count();
  },

  list(skip: number, take: number) {
    return prisma.announcement.findMany({
      skip,
      take,
      orderBy: [{ createdAt: 'desc' }],
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            adminId: true,
            employeeId: true
          }
        }
      }
    });
  }
};
