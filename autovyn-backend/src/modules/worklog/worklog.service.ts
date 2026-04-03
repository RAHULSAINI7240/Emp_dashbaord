import { Permission, Role, WorkActivityStatus } from '@prisma/client';
import { AppError } from '../../utils/app-error';
import { dateKeyToUtcDate, getDateKeyFromOffset, validateDateFormat } from '../../utils/date-time';
import { worklogLiveState } from './worklog.live';
import { worklogRepository } from './worklog.repository';

interface AuthContext {
  userId: string;
  role: Role;
  permissions: Permission[];
}

interface SummaryQuery {
  from: string;
  to: string;
  employeeId?: string;
  userId?: string;
}

interface DailyBucket {
  date: string;
  activeSeconds: number;
  inactiveSeconds: number;
  totalSeconds: number;
  productivityPercent: number;
}

interface AggregateSummary {
  activeSeconds: number;
  inactiveSeconds: number;
  totalSeconds: number;
  productivityPercent: number;
  daily: DailyBucket[];
}

interface LatestHeartbeat {
  userId: string;
  recordedAt: Date;
  status: WorkActivityStatus;
  durationSeconds: number;
  isFocused: boolean;
  editor: string;
}

type WorklogLiveStatus = 'ACTIVE' | 'IDLE' | 'OFFLINE';

const MANAGEMENT_PERMISSIONS: Permission[] = ['APPROVE_LEAVE', 'APPROVE_ARS', 'MANAGER', 'TEAM_LEAD'];

const hasManagementAccess = (auth: AuthContext): boolean => {
  if (auth.role === 'ADMIN') return true;
  return auth.permissions.some((permission) => MANAGEMENT_PERMISSIONS.includes(permission));
};

const productivityPercent = (activeSeconds: number, totalSeconds: number): number => {
  if (totalSeconds <= 0) return 0;
  return Math.round((activeSeconds / totalSeconds) * 100);
};

const LIVE_ACTIVE_WINDOW_MS = 90_000;

const resolveLiveStatus = (heartbeat?: LatestHeartbeat): WorklogLiveStatus => {
  if (!heartbeat) return 'OFFLINE';

  const ageMs = Date.now() - heartbeat.recordedAt.getTime();
  if (ageMs > LIVE_ACTIVE_WINDOW_MS) {
    return 'OFFLINE';
  }

  if (heartbeat.status === 'ACTIVE' && heartbeat.isFocused) {
    return 'ACTIVE';
  }

  return 'IDLE';
};

const normalizeEditor = (value?: string): string => {
  if (!value) return 'vscode';
  return value.trim().toLowerCase();
};

const buildRange = (from: string, to: string): { fromDate: Date; toDate: Date } => {
  validateDateFormat(from);
  validateDateFormat(to);
  const fromDate = dateKeyToUtcDate(from);
  const toDate = new Date(`${to}T23:59:59.999Z`);

  if (toDate < fromDate) {
    throw new AppError('to date must be greater than or equal to from date.', 400, 'INVALID_WORKLOG_DATE_RANGE');
  }

  return { fromDate, toDate };
};

const aggregateRows = (
  rows: Array<{ userId: string; recordedAt: Date; status: WorkActivityStatus; durationSeconds: number }>,
  timezoneOffsetMinutes: number
): AggregateSummary => {
  let activeSeconds = 0;
  let inactiveSeconds = 0;
  const dailyMap = new Map<string, { activeSeconds: number; inactiveSeconds: number }>();

  rows.forEach((row) => {
    const dateKey = getDateKeyFromOffset(row.recordedAt, timezoneOffsetMinutes);
    const day = dailyMap.get(dateKey) ?? { activeSeconds: 0, inactiveSeconds: 0 };

    if (row.status === 'ACTIVE') {
      activeSeconds += row.durationSeconds;
      day.activeSeconds += row.durationSeconds;
    } else {
      inactiveSeconds += row.durationSeconds;
      day.inactiveSeconds += row.durationSeconds;
    }

    dailyMap.set(dateKey, day);
  });

  const totalSeconds = activeSeconds + inactiveSeconds;
  const daily: DailyBucket[] = Array.from(dailyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, bucket]) => {
      const total = bucket.activeSeconds + bucket.inactiveSeconds;
      return {
        date,
        activeSeconds: bucket.activeSeconds,
        inactiveSeconds: bucket.inactiveSeconds,
        totalSeconds: total,
        productivityPercent: productivityPercent(bucket.activeSeconds, total)
      };
    });

  return {
    activeSeconds,
    inactiveSeconds,
    totalSeconds,
    productivityPercent: productivityPercent(activeSeconds, totalSeconds),
    daily
  };
};

export const worklogService = {
  async heartbeat(
    auth: AuthContext,
    payload: {
      status: WorkActivityStatus;
      durationSeconds: number;
      recordedAt?: string;
      deviceId?: string;
      editor?: string;
      isFocused?: boolean;
    }
  ) {
    const recordedAt = payload.recordedAt ? new Date(payload.recordedAt) : new Date();
    if (Number.isNaN(recordedAt.getTime())) {
      throw new AppError('Invalid recordedAt datetime.', 400, 'INVALID_WORKLOG_RECORDED_AT');
    }

    const editor = normalizeEditor(payload.editor);
    const saved = await worklogRepository.createHeartbeat({
      userId: auth.userId,
      recordedAt,
      status: payload.status,
      durationSeconds: payload.durationSeconds,
      deviceId: payload.deviceId,
      editor,
      isFocused: payload.isFocused ?? true
    });

    worklogLiveState.updateFromHeartbeat({
      userId: auth.userId,
      status: payload.status,
      editor,
      deviceId: payload.deviceId,
      isFocused: payload.isFocused ?? true,
      recordedAt
    });

    return {
      id: saved.id,
      userId: saved.userId,
      status: saved.status,
      durationSeconds: saved.durationSeconds,
      editor: saved.editor,
      deviceId: saved.deviceId,
      isFocused: saved.isFocused,
      recordedAt: saved.recordedAt.toISOString()
    };
  },

  async presence(
    auth: AuthContext,
    payload: {
      status: 'ACTIVE' | 'IDLE' | 'OFFLINE';
      recordedAt?: string;
      deviceId?: string;
      editor?: string;
      isFocused?: boolean;
    }
  ) {
    const editor = normalizeEditor(payload.editor);
    const presence = worklogLiveState.updatePresence({
      userId: auth.userId,
      status: payload.status,
      editor,
      deviceId: payload.deviceId,
      isFocused: payload.isFocused ?? payload.status === 'ACTIVE',
      recordedAt: payload.recordedAt ?? new Date().toISOString()
    });

    return presence;
  },

  async summary(auth: AuthContext, query: SummaryQuery, timezoneOffsetMinutes: number) {
    const { fromDate, toDate } = buildRange(query.from, query.to);
    const canManage = hasManagementAccess(auth);

    let targetUserIds: string[] = [];

    if (query.userId || query.employeeId) {
      const target = query.userId
        ? await worklogRepository.findUserById(query.userId)
        : await worklogRepository.findUserByEmployeeId(query.employeeId!);

      if (!target) {
        throw new AppError('Employee not found for worklog summary.', 404, 'WORKLOG_EMPLOYEE_NOT_FOUND');
      }

      if (!canManage && target.id !== auth.userId) {
        throw new AppError('You can only view your own worklog summary.', 403, 'WORKLOG_SCOPE_VIOLATION');
      }

      if (canManage && auth.role !== 'ADMIN' && target.id !== auth.userId && target.managerId !== auth.userId) {
        throw new AppError('You can only view worklog summary for your team members.', 403, 'WORKLOG_TEAM_SCOPE_VIOLATION');
      }

      targetUserIds = [target.id];
    } else if (canManage && auth.role === 'ADMIN') {
      const employees = await worklogRepository.listAllEmployeeIds();
      targetUserIds = employees.map((employee) => employee.id);
    } else if (canManage) {
      const teamMembers = await worklogRepository.listTeamMemberIds(auth.userId);
      targetUserIds = teamMembers.map((member) => member.id);
      if (!targetUserIds.length) {
        targetUserIds = [auth.userId];
      }
    } else {
      targetUserIds = [auth.userId];
    }

    if (!targetUserIds.length) {
      return {
        from: query.from,
        to: query.to,
        timezoneOffsetMinutes,
        totalActiveSeconds: 0,
        totalInactiveSeconds: 0,
        totalTrackedSeconds: 0,
        productivityPercent: 0,
        employeeCount: 0,
        employees: []
      };
    }

    const recentHeartbeatSince = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [rows, users, recentHeartbeats] = await Promise.all([
      worklogRepository.listHeartbeatsByUsersBetween(targetUserIds, fromDate, toDate),
      worklogRepository.listUsersByIds(targetUserIds),
      worklogRepository.listRecentHeartbeatsByUsers(targetUserIds, recentHeartbeatSince)
    ]);

    const rowsByUser = new Map<string, typeof rows>();
    rows.forEach((row) => {
      const list = rowsByUser.get(row.userId) ?? [];
      list.push(row);
      rowsByUser.set(row.userId, list);
    });

    const latestHeartbeatByUser = new Map<string, LatestHeartbeat>();
    recentHeartbeats.forEach((heartbeat) => {
      if (!latestHeartbeatByUser.has(heartbeat.userId)) {
        latestHeartbeatByUser.set(heartbeat.userId, heartbeat);
      }
    });

    const employeeSummaries = users
      .map((user) => {
        const summary = aggregateRows(rowsByUser.get(user.id) ?? [], timezoneOffsetMinutes);
        const latestHeartbeat = latestHeartbeatByUser.get(user.id);
        const livePresence = worklogLiveState.getPresence(user.id);
        return {
          user,
          activeSeconds: summary.activeSeconds,
          inactiveSeconds: summary.inactiveSeconds,
          totalTrackedSeconds: summary.totalSeconds,
          productivityPercent: summary.productivityPercent,
          daily: summary.daily,
          liveStatus: livePresence?.status ?? resolveLiveStatus(latestHeartbeat),
          lastHeartbeatAt: livePresence?.recordedAt ?? latestHeartbeat?.recordedAt.toISOString() ?? null,
          lastHeartbeatEditor: livePresence?.editor ?? latestHeartbeat?.editor ?? null,
          lastHeartbeatFocused: livePresence ? livePresence.isFocused : latestHeartbeat?.isFocused ?? null
        };
      })
      .sort((a, b) => a.user.name.localeCompare(b.user.name));

    const totalActiveSeconds = employeeSummaries.reduce((sum, item) => sum + item.activeSeconds, 0);
    const totalInactiveSeconds = employeeSummaries.reduce((sum, item) => sum + item.inactiveSeconds, 0);
    const totalTrackedSeconds = totalActiveSeconds + totalInactiveSeconds;

    return {
      from: query.from,
      to: query.to,
      timezoneOffsetMinutes,
      totalActiveSeconds,
      totalInactiveSeconds,
      totalTrackedSeconds,
      productivityPercent: productivityPercent(totalActiveSeconds, totalTrackedSeconds),
      employeeCount: employeeSummaries.length,
      employees: employeeSummaries
    };
  }
};
