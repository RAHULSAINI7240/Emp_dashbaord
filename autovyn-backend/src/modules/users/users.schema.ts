import { Permission, Role, WorkMode } from '@prisma/client';
import { z } from 'zod';
import { objectIdSchema } from '../../utils/object-id';

export const createUserSchema = z
  .object({
    employeeId: z.string().trim().regex(/^VYN\d{2,}$/i, 'employeeId must follow VYN format, e.g. VYN01').optional(),
    adminId: z.string().trim().regex(/^VYN\d{2,}$/i, 'adminId must follow VYN format, e.g. VYN01').optional(),
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().optional(),
    phone: z.string().trim().min(7).max(20).optional(),
    department: z.string().trim().min(1).max(100).optional(),
    profilePhotoUrl: z.string().trim().min(1).max(200000).optional(),
    joiningDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'joiningDate must be YYYY-MM-DD'),
    dateOfBirth: z.string().trim().min(2).max(40).optional(),
    gender: z.string().trim().min(1).max(20).optional(),
    bloodGroup: z.string().trim().min(1).max(20).optional(),
    emergencyContact: z.string().trim().min(7).max(20).optional(),
    address: z.string().trim().min(2).max(250).optional(),
    designation: z.string().trim().min(2).max(100),
    city: z.string().trim().min(2).max(100),
    workMode: z.nativeEnum(WorkMode),
    role: z.nativeEnum(Role).default(Role.EMPLOYEE),
    permissions: z.array(z.nativeEnum(Permission)).optional(),
    managerId: objectIdSchema.optional(),
    password: z.string().min(8).max(64),
    isActive: z.boolean().optional().default(true)
  })
  .superRefine((value, ctx) => {
    if (value.role === Role.ADMIN) {
      if (value.employeeId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['employeeId'], message: 'employeeId must be empty for ADMIN role.' });
      }
      return;
    }

    if (value.adminId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['adminId'], message: 'adminId is only allowed for ADMIN role.' });
    }
  });

export const listUsersQuerySchema = z.object({
  search: z.string().trim().optional(),
  city: z.string().trim().optional(),
  workMode: z.nativeEnum(WorkMode).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
});

export const listTeamMembersQuerySchema = listUsersQuerySchema.extend({
  onlineStatus: z.enum(['ONLINE', 'OFFLINE']).optional()
});

export const approverQuerySchema = z.object({
  type: z.enum(['leave', 'ars', 'both']).default('both')
});

export const updateMyProfilePhotoSchema = z.object({
  profilePhotoUrl: z.string().trim().min(1).max(200000)
});
