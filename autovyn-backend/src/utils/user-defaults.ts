import { Permission, Role, WorkMode } from '@prisma/client';

export const defaultPermissionsByRole = (role: Role): Permission[] => {
  if (role === Role.ADMIN) {
    return [
      Permission.APPROVE_LEAVE,
      Permission.APPROVE_ARS,
      Permission.VIEW_TEAM,
      Permission.MANAGE_EMPLOYEES,
      Permission.CREATE_USER,
      Permission.MANAGER,
      Permission.TEAM_LEAD
    ];
  }

  if (role === Role.HR) {
    return [Permission.CREATE_USER, Permission.VIEW_TEAM];
  }

  return [Permission.VIEW_TEAM];
};

export const defaultDesignationByRole = (role: Role): string => {
  if (role === Role.ADMIN) return 'Administrator';
  if (role === Role.HR) return 'HR';
  return 'Employee';
};

export const normalizeWorkMode = (value?: string): WorkMode => {
  if (value === WorkMode.WFH || value === WorkMode.HYBRID) {
    return value;
  }

  return WorkMode.WFO;
};
