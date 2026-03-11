import { AttendanceStatus, Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma';

interface AttendanceUpsertInput {
  status: AttendanceStatus;
  punchInAt?: Date | null;
  punchOutAt?: Date | null;
  workingMinutes?: number | null;
  timezoneOffsetMinutes?: number | null;
}

export const attendanceRepository = {
  findByUserAndDate(userId: string, date: Date) {
    return prisma.attendanceDay.findUnique({
      where: {
        userId_date: {
          userId,
          date
        }
      }
    });
  },

  upsert(userId: string, date: Date, data: AttendanceUpsertInput) {
    return prisma.attendanceDay.upsert({
      where: {
        userId_date: {
          userId,
          date
        }
      },
      update: {
        status: data.status,
        punchInAt: data.punchInAt,
        punchOutAt: data.punchOutAt,
        workingMinutes: data.workingMinutes,
        timezoneOffsetMinutes: data.timezoneOffsetMinutes
      },
      create: {
        userId,
        date,
        status: data.status,
        punchInAt: data.punchInAt,
        punchOutAt: data.punchOutAt,
        workingMinutes: data.workingMinutes,
        timezoneOffsetMinutes: data.timezoneOffsetMinutes
      }
    });
  },

  listByUserBetween(userId: string, start: Date, end: Date) {
    return prisma.attendanceDay.findMany({
      where: {
        userId,
        date: {
          gte: start,
          lte: end
        }
      },
      orderBy: {
        date: 'asc'
      }
    });
  },

  listHolidaysBetween(start: Date, end: Date) {
    return prisma.holiday.findMany({
      where: {
        date: {
          gte: start,
          lte: end
        }
      },
      select: {
        date: true,
        name: true,
        imageUrl: true
      }
    });
  },

  countReport(where: Prisma.AttendanceDayWhereInput) {
    return prisma.attendanceDay.count({ where });
  },

  listReport(where: Prisma.AttendanceDayWhereInput, skip: number, take: number) {
    return prisma.attendanceDay.findMany({
      where,
      skip,
      take,
      orderBy: [{ date: 'desc' }, { user: { name: 'asc' } }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            employeeId: true,
            role: true,
            managerId: true
          }
        }
      }
    });
  },

  listTeamMemberIds(managerId: string) {
    return prisma.user.findMany({
      where: {
        managerId,
        isActive: true
      },
      select: {
        id: true,
        employeeId: true
      }
    });
  },

  findUserByEmployeeId(employeeId: string) {
    return prisma.user.findFirst({
      where: { employeeId, isActive: true },
      select: { id: true, employeeId: true, managerId: true, role: true, name: true }
    });
  },

  async upsertStatusForDate(userId: string, date: Date, status: AttendanceStatus) {
    await prisma.attendanceDay.upsert({
      where: { userId_date: { userId, date } },
      update: {
        status
      },
      create: {
        userId,
        date,
        status
      }
    });
  }
};
