import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

export const holidaysRepository = {
  create(data: Prisma.HolidayUncheckedCreateInput) {
    return prisma.holiday.create({
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

  listByYear(start: Date, end: Date) {
    return prisma.holiday.findMany({
      where: {
        date: {
          gte: start,
          lte: end
        }
      },
      orderBy: [{ date: 'asc' }],
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
