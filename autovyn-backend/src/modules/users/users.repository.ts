import { Permission, Prisma, Role } from '@prisma/client';
import { prisma } from '../../db/prisma';

interface TeamFilter {
  search?: string;
  city?: string;
  workMode?: 'WFO' | 'WFH' | 'HYBRID';
  skip: number;
  take: number;
}

export const usersRepository = {
  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, name: true, employeeId: true, designation: true } },
        teamMembers: { select: { id: true, name: true, employeeId: true, designation: true } }
      }
    });
  },

  findByEmployeeId(employeeId: string) {
    return prisma.user.findFirst({ where: { employeeId } });
  },

  findByAdminId(adminId: string) {
    return prisma.user.findFirst({ where: { adminId } });
  },

  findByName(name: string) {
    return prisma.user.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' }
      }
    });
  },

  listLoginIds() {
    return prisma.user.findMany({
      select: {
        employeeId: true,
        adminId: true
      }
    });
  },

  createUser(data: Prisma.UserUncheckedCreateInput) {
    return prisma.user.create({ data });
  },

  updateProfilePhoto(userId: string, profilePhotoUrl: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { profilePhotoUrl }
    });
  },

  findApprovers(type: 'leave' | 'ars' | 'both') {
    const permissionFilter =
      type === 'leave'
        ? { has: Permission.APPROVE_LEAVE }
        : type === 'ars'
          ? { has: Permission.APPROVE_ARS }
          : { hasSome: [Permission.APPROVE_LEAVE, Permission.APPROVE_ARS] };

    return prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ role: Role.ADMIN }, { permissions: permissionFilter }]
      },
      select: {
        id: true,
        employeeId: true,
        adminId: true,
        name: true,
        designation: true,
        role: true,
        permissions: true
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }]
    });
  },

  async listTeamMembers(filter: TeamFilter) {
    const where: Prisma.UserWhereInput = {
      isActive: true,
      ...(filter.city ? { city: { equals: filter.city, mode: 'insensitive' } } : {}),
      ...(filter.workMode ? { workMode: filter.workMode } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { designation: { contains: filter.search, mode: 'insensitive' } },
              { employeeId: { contains: filter.search, mode: 'insensitive' } },
              { email: { contains: filter.search, mode: 'insensitive' } }
            ]
          }
        : {})
    };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: filter.skip,
        take: filter.take,
        orderBy: [{ name: 'asc' }],
        select: {
          id: true,
          employeeId: true,
          name: true,
          email: true,
          phone: true,
          department: true,
          designation: true,
          city: true,
          workMode: true,
          role: true,
          permissions: true,
          managerId: true
        }
      }),
      prisma.user.count({ where })
    ]);

    return { rows, total };
  },

  getAttendanceForDate(userIds: string[], date: Date) {
    return prisma.attendanceDay.findMany({
      where: {
        userId: { in: userIds },
        date
      },
      select: {
        userId: true,
        punchInAt: true,
        punchOutAt: true,
        status: true
      }
    });
  },

  listDirectReportIds(managerId: string) {
    return prisma.user.findMany({
      where: {
        isActive: true,
        managerId
      },
      select: {
        id: true
      }
    });
  },

  getHolidaysBetween(start: Date, end: Date) {
    return prisma.holiday.findMany({
      where: {
        date: {
          gte: start,
          lte: end
        }
      },
      select: { date: true }
    });
  },

  createAttendanceDefaults(data: Prisma.AttendanceDayCreateManyInput[]) {
    return prisma.attendanceDay.createMany({
      data
    });
  }
};
