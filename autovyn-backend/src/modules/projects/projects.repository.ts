import { Prisma, Role } from '@prisma/client';
import { prisma } from '../../db/prisma';

const projectInclude = {
  createdBy: {
    select: {
      id: true,
      name: true,
      employeeId: true,
      adminId: true,
      designation: true
    }
  },
  assignments: {
    orderBy: [{ createdAt: 'asc' as const }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          employeeId: true,
          adminId: true,
          designation: true,
          department: true,
          city: true
        }
      }
    }
  }
} satisfies Prisma.ProjectInclude;

export const projectsRepository = {
  createProject(data: Prisma.ProjectUncheckedCreateInput, assignments: Prisma.ProjectAssignmentUncheckedCreateInput[]) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data
      });

      if (assignments.length) {
        await tx.projectAssignment.createMany({
          data: assignments.map((assignment) => ({ ...assignment, projectId: project.id }))
        });
      }

      return tx.project.findUniqueOrThrow({
        where: { id: project.id },
        include: projectInclude
      });
    });
  },

  updateProject(
    id: string,
    data: Prisma.ProjectUncheckedUpdateInput,
    assignments: Prisma.ProjectAssignmentUncheckedCreateInput[]
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.project.update({
        where: { id },
        data
      });

      await tx.projectAssignment.deleteMany({
        where: { projectId: id }
      });

      if (assignments.length) {
        await tx.projectAssignment.createMany({
          data: assignments.map((assignment) => ({ ...assignment, projectId: id }))
        });
      }

      return tx.project.findUniqueOrThrow({
        where: { id },
        include: projectInclude
      });
    });
  },

  findById(id: string) {
    return prisma.project.findUnique({
      where: { id },
      include: projectInclude
    });
  },

  listVisibleProjects(auth: { userId: string; role: Role }, managedUserIds: string[] = []) {
    const where: Prisma.ProjectWhereInput =
      auth.role === Role.ADMIN || auth.role === Role.HR
        ? {}
        : {
            OR: [
              { createdById: auth.userId },
              { assignments: { some: { userId: auth.userId } } },
              ...(managedUserIds.length ? [{ assignments: { some: { userId: { in: managedUserIds } } } }] : [])
            ]
          };

    return prisma.project.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }],
      include: projectInclude
    });
  },

  listAssignableUsers(auth: { userId: string; role: Role }) {
    const where: Prisma.UserWhereInput =
      auth.role === Role.ADMIN || auth.role === Role.HR
        ? { isActive: true }
        : {
            isActive: true,
            OR: [{ id: auth.userId }, { managerId: auth.userId }]
          };

    return prisma.user.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        name: true,
        employeeId: true,
        adminId: true,
        designation: true,
        department: true,
        city: true,
        managerId: true
      }
    });
  }
};
