import { Prisma, Role, WorkActivityStatus } from '@prisma/client';
import { prisma } from '../../db/prisma';

interface CreateHeartbeatInput {
  userId: string;
  recordedAt: Date;
  status: WorkActivityStatus;
  durationSeconds: number;
  deviceId?: string;
  editor: string;
  isFocused: boolean;
}

export const worklogRepository = {
  createHeartbeat(input: CreateHeartbeatInput) {
    return prisma.workHeartbeat.create({
      data: {
        userId: input.userId,
        recordedAt: input.recordedAt,
        status: input.status,
        durationSeconds: input.durationSeconds,
        deviceId: input.deviceId,
        editor: input.editor,
        isFocused: input.isFocused
      }
    });
  },

  listHeartbeatsByUsersBetween(userIds: string[], from: Date, to: Date) {
    return prisma.workHeartbeat.findMany({
      where: {
        userId: { in: userIds },
        recordedAt: {
          gte: from,
          lte: to
        }
      },
      orderBy: {
        recordedAt: 'asc'
      },
      select: {
        userId: true,
        recordedAt: true,
        status: true,
        durationSeconds: true
      }
    });
  },

  listRecentHeartbeatsByUsers(userIds: string[], since: Date) {
    return prisma.workHeartbeat.findMany({
      where: {
        userId: { in: userIds },
        recordedAt: {
          gte: since
        }
      },
      orderBy: {
        recordedAt: 'desc'
      },
      select: {
        userId: true,
        recordedAt: true,
        status: true,
        durationSeconds: true,
        isFocused: true,
        editor: true
      }
    });
  },

  findUserById(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, isActive: true },
      select: {
        id: true,
        employeeId: true,
        name: true,
        designation: true,
        managerId: true,
        role: true
      }
    });
  },

  findUserByEmployeeId(employeeId: string) {
    return prisma.user.findFirst({
      where: { employeeId, isActive: true },
      select: {
        id: true,
        employeeId: true,
        name: true,
        designation: true,
        managerId: true,
        role: true
      }
    });
  },

  listUsersByIds(userIds: string[]) {
    return prisma.user.findMany({
      where: {
        id: { in: userIds },
        isActive: true
      },
      select: {
        id: true,
        employeeId: true,
        name: true,
        designation: true,
        managerId: true,
        role: true
      }
    });
  },

  listAllEmployeeIds() {
    return prisma.user.findMany({
      where: {
        isActive: true,
        role: Role.EMPLOYEE
      },
      select: {
        id: true
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
        id: true
      }
    });
  },

  countHeartbeats(where: Prisma.WorkHeartbeatWhereInput) {
    return prisma.workHeartbeat.count({ where });
  }
};
