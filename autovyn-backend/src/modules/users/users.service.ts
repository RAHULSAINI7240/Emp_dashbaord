import { Permission, Prisma, Role } from '@prisma/client';
import { AppError } from '../../utils/app-error';
import { getPagination, buildPaginationMeta } from '../../utils/pagination';
import { hashPassword, isStrongPassword } from '../../utils/password';
import { usersRepository } from './users.repository';
import { dateKeyToUtcDate, formatUtcDateToKey, getDateKeyFromOffset, isWeekend } from '../../utils/date-time';

interface CreateUserPayload {
  employeeId?: string;
  adminId?: string;
  name: string;
  email?: string;
  phone?: string;
  department?: string;
  profilePhotoUrl?: string;
  joiningDate: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  emergencyContact?: string;
  address?: string;
  designation: string;
  city: string;
  workMode: 'WFO' | 'WFH' | 'HYBRID';
  role: Role;
  permissions?: Permission[];
  managerId?: string;
  password: string;
  isActive?: boolean;
}

interface AuthContext {
  userId: string;
  role: Role;
  permissions: Permission[];
}

const VYN_CODE_REGEX = /^VYN(\d+)$/i;

const defaultPermissionsByRole = (role: Role): Permission[] => {
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

const JOINING_DATE_PASSWORD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const ensureManagePermission = (auth: AuthContext): void => {
  if (auth.role === Role.ADMIN) return;
  if (auth.role === Role.HR) return;
  if (!auth.permissions.includes(Permission.CREATE_USER) && !auth.permissions.includes(Permission.MANAGE_EMPLOYEES)) {
    throw new AppError('You do not have permission to create users.', 403, 'FORBIDDEN_CREATE_USER');
  }
};

const isAllowedInitialPassword = (password: string, joiningDate: string): boolean => {
  if (isStrongPassword(password)) {
    return true;
  }

  return password === joiningDate && JOINING_DATE_PASSWORD_REGEX.test(joiningDate);
};

const formatVynCode = (sequence: number): string => `VYN${String(sequence).padStart(2, '0')}`;

const parseVynCode = (value: string | null | undefined): number => {
  if (!value) return 0;
  const match = value.match(VYN_CODE_REGEX);
  if (!match) return 0;
  return Number(match[1]);
};

const resolveNextVynLoginId = async (): Promise<string> => {
  const ids = await usersRepository.listLoginIds();
  const maxCode = ids.reduce((max, row) => {
    return Math.max(max, parseVynCode(row.employeeId), parseVynCode(row.adminId));
  }, 0);

  return formatVynCode(maxCode + 1);
};

const initializeCurrentMonthAttendance = async (userId: string): Promise<void> => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  const allDates: string[] = [];
  const cursor = new Date(monthStart);
  while (cursor <= monthEnd) {
    allDates.push(formatUtcDateToKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const holidays = await usersRepository.getHolidaysBetween(monthStart, monthEnd);
  const holidaySet = new Set(holidays.map((item) => formatUtcDateToKey(item.date)));

  const defaults: Prisma.AttendanceDayCreateManyInput[] = allDates.map((date) => ({
    userId,
    date: dateKeyToUtcDate(date),
    status: holidaySet.has(date) ? 'HOLIDAY' : isWeekend(date) ? 'WEEKEND' : 'ABSENT',
    timezoneOffsetMinutes: 0
  }));

  await usersRepository.createAttendanceDefaults(defaults);
};

const serializePublicUser = (user: {
  id: string;
  employeeId: string | null;
  adminId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  department: string | null;
  profilePhotoUrl: string | null;
  joiningDate: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  bloodGroup: string | null;
  emergencyContact: string | null;
  address: string | null;
  designation: string;
  city: string;
  workMode: 'WFO' | 'WFH' | 'HYBRID';
  role: Role;
  permissions: Permission[];
  managerId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: user.id,
  employeeId: user.employeeId,
  adminId: user.adminId,
  name: user.name,
  email: user.email,
  phone: user.phone,
  department: user.department,
  profilePhotoUrl: user.profilePhotoUrl,
  joiningDate: user.joiningDate,
  dateOfBirth: user.dateOfBirth,
  gender: user.gender,
  bloodGroup: user.bloodGroup,
  emergencyContact: user.emergencyContact,
  address: user.address,
  designation: user.designation,
  city: user.city,
  workMode: user.workMode,
  role: user.role,
  permissions: user.permissions,
  managerId: user.managerId,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

export const usersService = {
  async createUser(payload: CreateUserPayload, auth: AuthContext) {
    ensureManagePermission(auth);

    if (!isAllowedInitialPassword(payload.password, payload.joiningDate)) {
      throw new AppError(
        'Password must be strong or exactly match the joining date in YYYY-MM-DD format.',
        400,
        'WEAK_PASSWORD'
      );
    }

    const autoGeneratedLoginId =
      payload.role === Role.ADMIN
        ? payload.adminId ?? (await resolveNextVynLoginId())
        : payload.employeeId ?? (await resolveNextVynLoginId());

    const resolvedAdminId = payload.role === Role.ADMIN ? autoGeneratedLoginId : undefined;
    const resolvedEmployeeId = payload.role !== Role.ADMIN ? autoGeneratedLoginId : undefined;

    if (resolvedEmployeeId) {
      const employeeExists = await usersRepository.findByEmployeeId(resolvedEmployeeId);
      if (employeeExists) {
        throw new AppError('employeeId already exists.', 409, 'EMPLOYEE_ID_EXISTS');
      }
    }

    if (resolvedAdminId) {
      const adminExists = await usersRepository.findByAdminId(resolvedAdminId);
      if (adminExists) {
        throw new AppError('adminId already exists.', 409, 'ADMIN_ID_EXISTS');
      }
    }

    if (payload.managerId) {
      const manager = await usersRepository.findById(payload.managerId);
      if (!manager || !manager.isActive) {
        throw new AppError('Manager does not exist or inactive.', 400, 'INVALID_MANAGER');
      }
    }

    const passwordHash = await hashPassword(payload.password);

    const user = await usersRepository.createUser({
      employeeId: resolvedEmployeeId,
      adminId: resolvedAdminId,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      department: payload.department,
      profilePhotoUrl: payload.profilePhotoUrl,
      joiningDate: payload.joiningDate,
      dateOfBirth: payload.dateOfBirth,
      gender: payload.gender,
      bloodGroup: payload.bloodGroup,
      emergencyContact: payload.emergencyContact,
      address: payload.address,
      designation: payload.designation,
      city: payload.city,
      workMode: payload.workMode,
      role: payload.role,
      permissions: payload.permissions?.length ? payload.permissions : defaultPermissionsByRole(payload.role),
      managerId: payload.managerId,
      passwordHash,
      isActive: payload.isActive ?? true
    });

    await initializeCurrentMonthAttendance(user.id);

    return serializePublicUser(user);
  },

  async me(authUserId: string) {
    const user = await usersRepository.findById(authUserId);
    if (!user || !user.isActive) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    return {
      ...serializePublicUser(user),
      manager: user.manager,
      teamMembers: user.teamMembers
    };
  },

  async updateMyProfilePhoto(authUserId: string, profilePhotoUrl: string) {
    const user = await usersRepository.findById(authUserId);
    if (!user || !user.isActive) {
      throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
    }

    const updated = await usersRepository.updateProfilePhoto(authUserId, profilePhotoUrl.trim());
    return serializePublicUser(updated);
  },

  async approvers(type: 'leave' | 'ars' | 'both') {
    const approvers = await usersRepository.findApprovers(type);
    return approvers;
  },

  async listUsers(query: { search?: string; city?: string; workMode?: 'WFO' | 'WFH' | 'HYBRID'; page?: number; limit?: number }) {
    const { page, limit, skip } = getPagination(query);

    const { rows, total } = await usersRepository.listUsers({
      search: query.search,
      city: query.city,
      workMode: query.workMode,
      skip,
      take: limit
    });

    return {
      items: rows.map((row) => ({
        ...serializePublicUser(row),
        manager: row.manager,
        teamMembers: row.teamMembers
      })),
      pagination: buildPaginationMeta(page, limit, total)
    };
  },

  async listTeamMembers(
    query: {
      search?: string;
      city?: string;
      workMode?: 'WFO' | 'WFH' | 'HYBRID';
      onlineStatus?: 'ONLINE' | 'OFFLINE';
      page?: number;
      limit?: number;
    },
    timezoneOffsetMinutes: number
  ) {
    const { page, limit, skip } = getPagination(query);

    const { rows, total } = await usersRepository.listTeamMembers({
      search: query.search,
      city: query.city,
      workMode: query.workMode,
      skip,
      take: limit
    });

    const todayKey = getDateKeyFromOffset(new Date(), timezoneOffsetMinutes);
    const attendanceRows = await usersRepository.getAttendanceForDate(
      rows.map((row) => row.id),
      dateKeyToUtcDate(todayKey)
    );
    const attendanceMap = new Map(attendanceRows.map((row) => [row.userId, row]));

    let members = rows.map((user) => {
      const day = attendanceMap.get(user.id);
      const onlineStatus = day?.punchInAt && !day.punchOutAt ? 'ONLINE' : 'OFFLINE';
      return {
        ...user,
        onlineStatus
      };
    });

    if (query.onlineStatus) {
      members = members.filter((member) => member.onlineStatus === query.onlineStatus);
    }

    return {
      items: members,
      pagination: buildPaginationMeta(page, limit, total)
    };
  },

  async getTeamMember(memberId: string, timezoneOffsetMinutes: number) {
    const user = await usersRepository.findById(memberId);
    if (!user || !user.isActive) {
      throw new AppError('Team member not found.', 404, 'TEAM_MEMBER_NOT_FOUND');
    }

    const todayKey = getDateKeyFromOffset(new Date(), timezoneOffsetMinutes);
    const attendance = await usersRepository.getAttendanceForDate([user.id], dateKeyToUtcDate(todayKey));
    const day = attendance[0];
    const onlineStatus = day?.punchInAt && !day.punchOutAt ? 'ONLINE' : 'OFFLINE';

    return {
      ...serializePublicUser(user),
      onlineStatus,
      manager: user.manager,
      teamMembers: user.teamMembers
    };
  }
};
