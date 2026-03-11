import { AttendanceStatus, Permission, Role } from '@prisma/client';
import { LATE_PUNCH_THRESHOLD } from '../../config/constants';
import { AppError } from '../../utils/app-error';
import {
  compareDateKeys,
  dateKeyToUtcDate,
  enumerateMonthDateKeys,
  formatUtcDateToKey,
  getDateKeyFromOffset,
  getTimeFromOffset,
  isWeekend,
  minutesBetween,
  minutesToHHMM,
  monthStartEnd,
  validateDateFormat
} from '../../utils/date-time';
import { buildPaginationMeta, getPagination } from '../../utils/pagination';
import { attendanceRepository } from './attendance.repository';

interface AuthContext {
  userId: string;
  role: Role;
  permissions: Permission[];
}

interface ReportQuery {
  from: string;
  to: string;
  employeeId?: string;
  page?: number;
  limit?: number;
}

const canAccessReport = (auth: AuthContext): boolean => {
  if (auth.role === 'ADMIN') return true;
  return auth.permissions.some((permission) =>
    ['APPROVE_LEAVE', 'APPROVE_ARS', 'MANAGER', 'TEAM_LEAD'].includes(permission)
  );
};

const mapAttendanceRow = (
  row: {
    date: Date;
    status: AttendanceStatus;
    punchInAt: Date | null;
    punchOutAt: Date | null;
    workingMinutes: number | null;
  },
  timezoneOffsetMinutes: number
) => ({
  date: formatUtcDateToKey(row.date),
  status: row.status,
  punchInUtc: row.punchInAt?.toISOString() ?? null,
  punchOutUtc: row.punchOutAt?.toISOString() ?? null,
  punchInLocal: row.punchInAt ? getTimeFromOffset(row.punchInAt, timezoneOffsetMinutes) : null,
  punchOutLocal: row.punchOutAt ? getTimeFromOffset(row.punchOutAt, timezoneOffsetMinutes) : null,
  workingMinutes: row.workingMinutes,
  workingHours: minutesToHHMM(row.workingMinutes)
});

export const attendanceService = {
  async punchIn(auth: AuthContext, timezoneOffsetMinutes: number) {
    if (auth.role === 'ADMIN') {
      throw new AppError('Admin cannot use employee punch-in endpoint.', 403, 'ADMIN_PUNCH_NOT_ALLOWED');
    }

    const now = new Date();
    const dateKey = getDateKeyFromOffset(now, timezoneOffsetMinutes);
    const date = dateKeyToUtcDate(dateKey);

    const existing = await attendanceRepository.findByUserAndDate(auth.userId, date);
    if (existing?.punchInAt) {
      throw new AppError('Already punched in for today.', 400, 'ALREADY_PUNCHED_IN');
    }

    const localTime = getTimeFromOffset(now, timezoneOffsetMinutes);
    const status = localTime > LATE_PUNCH_THRESHOLD ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;

    const saved = await attendanceRepository.upsert(auth.userId, date, {
      status,
      punchInAt: now,
      punchOutAt: existing?.punchOutAt,
      workingMinutes: existing?.workingMinutes,
      timezoneOffsetMinutes
    });

    return mapAttendanceRow(saved, timezoneOffsetMinutes);
  },

  async punchOut(auth: AuthContext, timezoneOffsetMinutes: number) {
    if (auth.role === 'ADMIN') {
      throw new AppError('Admin cannot use employee punch-out endpoint.', 403, 'ADMIN_PUNCH_NOT_ALLOWED');
    }

    const now = new Date();
    const dateKey = getDateKeyFromOffset(now, timezoneOffsetMinutes);
    const date = dateKeyToUtcDate(dateKey);

    const existing = await attendanceRepository.findByUserAndDate(auth.userId, date);
    if (!existing?.punchInAt) {
      throw new AppError('Punch-in is required before punch-out.', 400, 'PUNCH_IN_REQUIRED');
    }

    if (existing.punchOutAt) {
      throw new AppError('Already punched out for today.', 400, 'ALREADY_PUNCHED_OUT');
    }

    const workingMinutes = minutesBetween(existing.punchInAt, now);
    const status = workingMinutes >= 540 ? AttendanceStatus.OVERTIME : existing.status;

    const saved = await attendanceRepository.upsert(auth.userId, date, {
      status,
      punchInAt: existing.punchInAt,
      punchOutAt: now,
      workingMinutes,
      timezoneOffsetMinutes
    });

    return mapAttendanceRow(saved, timezoneOffsetMinutes);
  },

  async getMonth(auth: AuthContext, month: string, timezoneOffsetMinutes: number) {
    if (auth.role === 'ADMIN') {
      throw new AppError('Admin cannot use employee month endpoint.', 403, 'ADMIN_MONTH_NOT_ALLOWED');
    }

    const { start, end } = monthStartEnd(month);
    const [rows, holidays] = await Promise.all([
      attendanceRepository.listByUserBetween(auth.userId, start, end),
      attendanceRepository.listHolidaysBetween(start, end)
    ]);

    const rowMap = new Map(rows.map((row) => [formatUtcDateToKey(row.date), row]));
    const holidayMap = new Map(holidays.map((holiday) => [formatUtcDateToKey(holiday.date), holiday]));

    const todayKey = getDateKeyFromOffset(new Date(), timezoneOffsetMinutes);

    const calendar = enumerateMonthDateKeys(month).map((key) => {
      const row = rowMap.get(key);
      if (row) {
        return {
          ...mapAttendanceRow(row, timezoneOffsetMinutes),
          holiday: holidayMap.get(key) ?? null
        };
      }

      const holiday = holidayMap.get(key);
      const status: AttendanceStatus = holiday
        ? 'HOLIDAY'
        : isWeekend(key)
          ? 'WEEKEND'
          : compareDateKeys(key, todayKey) > 0
            ? 'INVALID'
            : 'ABSENT';

      return {
        date: key,
        status,
        punchInUtc: null,
        punchOutUtc: null,
        punchInLocal: null,
        punchOutLocal: null,
        workingMinutes: null,
        workingHours: null,
        holiday: holiday ?? null
      };
    });

    const summary = calendar.reduce<Record<AttendanceStatus, number>>(
      (acc, day) => {
        acc[day.status] += 1;
        return acc;
      },
      {
        PRESENT: 0,
        LEAVE: 0,
        ABSENT: 0,
        HALF_DAY: 0,
        LATE: 0,
        HOLIDAY: 0,
        WEEKEND: 0,
        OVERTIME: 0,
        INVALID: 0
      }
    );

    return {
      month,
      timezoneOffsetMinutes,
      summary,
      calendar
    };
  },

  async getDay(auth: AuthContext, dateKey: string, timezoneOffsetMinutes: number) {
    if (auth.role === 'ADMIN') {
      throw new AppError('Admin cannot use employee day endpoint.', 403, 'ADMIN_DAY_NOT_ALLOWED');
    }

    validateDateFormat(dateKey);
    const date = dateKeyToUtcDate(dateKey);

    const [row, holidays] = await Promise.all([
      attendanceRepository.findByUserAndDate(auth.userId, date),
      attendanceRepository.listHolidaysBetween(date, date)
    ]);

    if (row) {
      return {
        ...mapAttendanceRow(row, timezoneOffsetMinutes),
        holiday: holidays[0] ?? null
      };
    }

    const todayKey = getDateKeyFromOffset(new Date(), timezoneOffsetMinutes);
    const holiday = holidays[0];
    const status: AttendanceStatus = holiday
      ? 'HOLIDAY'
      : isWeekend(dateKey)
        ? 'WEEKEND'
        : compareDateKeys(dateKey, todayKey) > 0
          ? 'INVALID'
          : 'ABSENT';

    return {
      date: dateKey,
      status,
      punchInUtc: null,
      punchOutUtc: null,
      punchInLocal: null,
      punchOutLocal: null,
      workingMinutes: null,
      workingHours: null,
      holiday: holiday ?? null
    };
  },

  async report(auth: AuthContext, query: ReportQuery, timezoneOffsetMinutes: number) {
    if (!canAccessReport(auth)) {
      throw new AppError('You do not have report access.', 403, 'FORBIDDEN_ATTENDANCE_REPORT');
    }

    validateDateFormat(query.from);
    validateDateFormat(query.to);

    const { page, limit, skip } = getPagination(query);

    const from = dateKeyToUtcDate(query.from);
    const to = dateKeyToUtcDate(query.to);

    if (to < from) {
      throw new AppError('to date must be >= from date.', 400, 'INVALID_DATE_RANGE');
    }

    let whereUserIds: string[] | undefined;

    if (auth.role !== 'ADMIN') {
      const teamMembers = await attendanceRepository.listTeamMemberIds(auth.userId);
      whereUserIds = teamMembers.map((member) => member.id);
      if (!whereUserIds.length) {
        return {
          items: [],
          pagination: buildPaginationMeta(page, limit, 0)
        };
      }
    }

    if (query.employeeId) {
      const employee = await attendanceRepository.findUserByEmployeeId(query.employeeId);
      if (!employee) {
        throw new AppError('Employee not found for report.', 404, 'REPORT_EMPLOYEE_NOT_FOUND');
      }

      if (auth.role !== 'ADMIN' && employee.managerId !== auth.userId) {
        throw new AppError('You can only access reports of your team members.', 403, 'REPORT_TEAM_SCOPE_VIOLATION');
      }

      whereUserIds = [employee.id];
    }

    const where = {
      date: {
        gte: from,
        lte: to
      },
      ...(whereUserIds ? { userId: { in: whereUserIds } } : {})
    };

    const [rows, total] = await Promise.all([
      attendanceRepository.listReport(where, skip, limit),
      attendanceRepository.countReport(where)
    ]);

    return {
      items: rows.map((row) => ({
        user: row.user,
        ...mapAttendanceRow(row, timezoneOffsetMinutes)
      })),
      pagination: buildPaginationMeta(page, limit, total)
    };
  },

  async upsertStatus(userId: string, dateKey: string, status: AttendanceStatus): Promise<void> {
    await attendanceRepository.upsertStatusForDate(userId, dateKeyToUtcDate(dateKey), status);
  },

  async upsertCorrectedPunch(
    userId: string,
    dateKey: string,
    status: AttendanceStatus,
    correctedPunchInAt?: Date,
    correctedPunchOutAt?: Date,
    timezoneOffsetMinutes?: number
  ): Promise<void> {
    const date = dateKeyToUtcDate(dateKey);
    const existing = await attendanceRepository.findByUserAndDate(userId, date);
    const effectiveOffset = existing?.timezoneOffsetMinutes ?? timezoneOffsetMinutes ?? -330;

    const localTimeToUtc = (hours: number, minutes: number): Date => {
      const [year, month, day] = dateKey.split('-').map((part) => Number(part));
      const localMs = Date.UTC(year, month - 1, day, hours, minutes, 0, 0);
      const utcMs = localMs + effectiveOffset * 60_000;
      return new Date(utcMs);
    };

    const defaultPunchInAt = localTimeToUtc(9, 30);
    const defaultPunchOutAt = localTimeToUtc(18, 0);

    const resolvedPunchInAt = correctedPunchInAt ?? existing?.punchInAt ?? defaultPunchInAt;
    let resolvedPunchOutAt = correctedPunchOutAt ?? existing?.punchOutAt ?? defaultPunchOutAt;
    if (resolvedPunchOutAt <= resolvedPunchInAt) {
      resolvedPunchOutAt = new Date(resolvedPunchInAt.getTime() + 8.5 * 60 * 60 * 1000);
    }

    const workingMinutes = minutesBetween(resolvedPunchInAt, resolvedPunchOutAt);

    await attendanceRepository.upsert(userId, date, {
      status,
      punchInAt: resolvedPunchInAt,
      punchOutAt: resolvedPunchOutAt,
      workingMinutes,
      timezoneOffsetMinutes: effectiveOffset
    });
  }
};
