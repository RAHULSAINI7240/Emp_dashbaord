import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { AttendanceStatus, Permission, PrismaClient, Role, WorkMode } from '@prisma/client';

const DEFAULT_ADMIN_LOGIN_ID_OVERRIDES = ['VYNCOO', 'VYNCFO', 'VYNCTO', 'VYNCEO'];
const DEFAULT_HR_LOGIN_ID_OVERRIDES = ['VYN210', 'VYN142'];
const ADMIN_LOGIN_SUFFIX_REGEX = /(ADMIN|CEO|COO|CFO|CTO)$/i;
const ADMIN_ROLE_HINT_REGEX = /\b(admin(?:istrator)?|ceo|coo|cfo|cto|director|founder)\b/i;
const HR_ROLE_HINT_REGEX = /\b(hr|human\s*resources?|talent\s*acquisition|recruit(?:er|ment))\b/i;
const MANAGER_ROLE_HINT_REGEX = /\b(manager|team\s*lead|reporting\s*authority)\b/i;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DMY_DATE_REGEX = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const EXCEL_SERIAL_REGEX = /^\d+(?:\.\d+)?$/;
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

const normalize = (value: string | undefined): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed.toUpperCase() === 'NULL') return '';
  return trimmed;
};

const normalizeHeader = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const splitList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => normalize(entry))
    .filter(Boolean);

const normalizeLoginId = (value: string): string => normalize(value).toUpperCase();

const buildConfiguredLoginIdSet = (value: string | undefined, fallback: string[]): Set<string> => {
  const configured = splitList(value).map((entry) => entry.toUpperCase());
  return new Set(configured.length ? configured : fallback);
};

const ADMIN_LOGIN_ID_OVERRIDES = buildConfiguredLoginIdSet(
  process.env.IMPORT_ADMIN_LOGIN_IDS,
  DEFAULT_ADMIN_LOGIN_ID_OVERRIDES
);

const HR_LOGIN_ID_OVERRIDES = buildConfiguredLoginIdSet(process.env.IMPORT_HR_LOGIN_IDS, DEFAULT_HR_LOGIN_ID_OVERRIDES);

const HR_DESIGNATION_ID_OVERRIDES = new Set(splitList(process.env.IMPORT_HR_DESIGNATION_IDS));

const parseCsv = (input: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    const next = input[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      continue;
    }

    if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += ch;
  }

  row.push(field.replace(/\r$/, ''));
  rows.push(row);
  return rows.filter((parsedRow) => parsedRow.some((value) => value.length > 0));
};

const parseWorkMode = (raw: string): WorkMode => {
  const value = normalize(raw);
  if (value === '1') return WorkMode.WFO;
  if (value === '2') return WorkMode.HYBRID;
  if (value === '3') return WorkMode.WFH;
  return WorkMode.WFO;
};

const parseBooleanFlag = (raw: string): boolean | null => {
  const value = normalize(raw).toLowerCase();
  if (!value) return null;
  if (['1', 'true', 'yes', 'y', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(value)) return false;
  return null;
};

const toIsoDateOnlyUtc = (value: Date): string => value.toISOString().slice(0, 10);

const parseExcelSerialDate = (raw: string): string | null => {
  if (!EXCEL_SERIAL_REGEX.test(raw)) return null;

  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const wholeDays = Math.floor(numeric);
  const date = new Date(EXCEL_EPOCH_UTC + wholeDays * 24 * 60 * 60 * 1000);
  return toIsoDateOnlyUtc(date);
};

const normalizeImportedDate = (raw: string): string | null => {
  const value = normalize(raw);
  if (!value) return null;
  if (ISO_DATE_REGEX.test(value)) return value;

  const serialDate = parseExcelSerialDate(value);
  if (serialDate) return serialDate;

  const dmyMatch = value.match(DMY_DATE_REGEX);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(parsed.getTime()) ? value : toIsoDateOnlyUtc(parsed);
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDateOnlyUtc(parsed);
  }

  return value;
};

const resolvePermissions = (role: Role, isReportingAuthority: boolean): Permission[] => {
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

  if (isReportingAuthority) {
    return [Permission.APPROVE_LEAVE, Permission.APPROVE_ARS, Permission.VIEW_TEAM, Permission.MANAGER];
  }

  return [Permission.VIEW_TEAM];
};

const resolveRole = (input: {
  designationId: string;
  email: string;
  loginId: string;
  roleHints: string[];
}): Role => {
  const emailLocalPart = input.email.split('@')[0]?.trim().toLowerCase() ?? '';
  const roleHintText = input.roleHints
    .map((hint) => normalize(hint))
    .filter(Boolean)
    .join(' ');

  if (ADMIN_LOGIN_ID_OVERRIDES.has(input.loginId)) return Role.ADMIN;
  if (ADMIN_LOGIN_SUFFIX_REGEX.test(input.loginId)) return Role.ADMIN;
  if (ADMIN_ROLE_HINT_REGEX.test(roleHintText)) return Role.ADMIN;

  if (HR_LOGIN_ID_OVERRIDES.has(input.loginId)) return Role.HR;
  if (HR_DESIGNATION_ID_OVERRIDES.has(input.designationId)) return Role.HR;
  if (emailLocalPart === 'hr') return Role.HR;
  if (HR_ROLE_HINT_REGEX.test(roleHintText)) return Role.HR;

  return Role.EMPLOYEE;
};

const resolveReportingAuthority = (rawFlag: string, roleHints: string[]): boolean => {
  const parsedFlag = parseBooleanFlag(rawFlag);
  if (parsedFlag !== null) return parsedFlag;

  const roleHintText = roleHints
    .map((hint) => normalize(hint))
    .filter(Boolean)
    .join(' ');

  return MANAGER_ROLE_HINT_REGEX.test(roleHintText);
};

const toDateOnlyUtc = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const monthDateRangeUtc = (year: number, month: number): Date[] => {
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  const dates: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const randomInRange = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

const withTimeUtc = (date: Date, hour: number, minute: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0));

export interface ImportUsersFromCsvOptions {
  csvPath: string;
  defaultPassword?: string;
  prismaClient?: PrismaClient;
  resetExisting?: boolean;
}

export interface ImportUsersFromCsvResult {
  attendanceRowsCreated: number;
  created: number;
  csvPasswordCount: number;
  fallbackPasswordCount: number;
  managerMapped: number;
  overriddenPasswordCount: number;
  passwordMode: 'csv' | 'fixed';
  skippedDuplicates: number;
}

export const resolveBundledDummyUsersCsvPath = (): string => path.join(__dirname, 'data', 'dummy-autovyn-users.csv');

export const importUsersFromCsv = async (options: ImportUsersFromCsvOptions): Promise<ImportUsersFromCsvResult> => {
  const prisma = options.prismaClient ?? new PrismaClient();

  try {
    const absolutePath = path.resolve(options.csvPath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`CSV file not found: ${absolutePath}`);
    }

    const content = fs.readFileSync(absolutePath, 'utf8');
    const rows = parseCsv(content);
    if (rows.length < 2) {
      throw new Error('CSV has no data rows.');
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);
    const headerIndex = new Map(headers.map((header, index) => [header, index]));
    const normalizedHeaderIndex = new Map(headers.map((header, index) => [normalizeHeader(header), index]));

    const resolveIndex = (name: string): number | undefined =>
      headerIndex.get(name) ?? normalizedHeaderIndex.get(normalizeHeader(name));

    const requiredColumns = [
      'Userid',
      'UserName',
      'UserPassword',
      'FullName',
      'PhoneNo',
      'OfficialEmailID',
      'EmailID',
      'EmployeeID',
      'DesignationID',
      'Branch',
      'IsActive',
      'IsReportingAuthority',
      'WorkMode',
      'ReportingAuthorityID'
    ];

    for (const column of requiredColumns) {
      if (resolveIndex(column) === undefined) {
        throw new Error(`Missing expected column: ${column}`);
      }
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
    const seenEmails = new Set<string>();
    const seenLoginIds = new Set<string>();
    const legacyUserIdToNewId = new Map<string, string>();
    const managerLinks: Array<{ managerLegacyUserId: string; userId: string }> = [];

    if (options.resetExisting ?? true) {
      await prisma.refreshToken.deleteMany();
      await prisma.arsRequest.deleteMany();
      await prisma.leaveRequest.deleteMany();
      await prisma.attendanceDay.deleteMany();
      await prisma.announcement.deleteMany();
      await prisma.holiday.deleteMany();
      await prisma.policy.deleteMany();
      await prisma.credential.deleteMany();
      await prisma.projectAssignment.deleteMany();
      await prisma.project.deleteMany();
      await prisma.screenshot.deleteMany();
      await prisma.workHeartbeat.deleteMany();
      await prisma.user.updateMany({ data: { managerId: null } });
      await prisma.user.deleteMany();
    }

    let created = 0;
    let skippedDuplicates = 0;
    let csvPasswordCount = 0;
    let fallbackPasswordCount = 0;
    let overriddenPasswordCount = 0;

    for (const row of dataRows) {
      const get = (name: string): string => {
        const index = resolveIndex(name);
        if (index === undefined) return '';
        return normalize(row[index]);
      };

      const getAny = (...aliases: string[]): string => {
        for (const alias of aliases) {
          const value = get(alias);
          if (value) return value;
        }
        return '';
      };

      const legacyUserId = get('Userid');
      const loginId = normalizeLoginId(getAny('EmployeeID', 'EmployeeId', 'EmployeeCode') || get('UserName'));
      if (!loginId) {
        continue;
      }

      if (seenLoginIds.has(loginId)) {
        skippedDuplicates += 1;
        continue;
      }
      seenLoginIds.add(loginId);

      const fullName = getAny('FullName', 'EmployeeName', 'Name') || get('UserName') || loginId;
      const rawPassword = get('UserPassword');
      const normalizedPassword = normalizeImportedDate(rawPassword) ?? rawPassword;
      const passwordText = (options.defaultPassword ?? normalizedPassword) || loginId;

      if (options.defaultPassword) {
        overriddenPasswordCount += 1;
      } else if (rawPassword) {
        csvPasswordCount += 1;
      } else {
        fallbackPasswordCount += 1;
      }

      const passwordHash = await bcrypt.hash(passwordText, saltRounds);
      const rawEmail = (get('OfficialEmailID') || get('EmailID')).toLowerCase();
      const roleHints = [
        getAny('Role', 'RoleID', 'RoleName', 'Designation', 'DesignationName'),
        getAny('Department', 'DepartmentName', 'Team', 'Teams'),
        rawEmail,
        loginId
      ];
      const role = resolveRole({
        loginId,
        email: rawEmail,
        designationId: get('DesignationID'),
        roleHints
      });
      const isReportingAuthority = resolveReportingAuthority(get('IsReportingAuthority'), roleHints);
      const permissions = resolvePermissions(role, isReportingAuthority);

      let email: string | null = rawEmail || null;
      if (email) {
        if (seenEmails.has(email)) {
          email = null;
        } else {
          seenEmails.add(email);
        }
      }

      const user = await prisma.user.create({
        data: {
          adminId: role === Role.ADMIN ? loginId : null,
          employeeId: role !== Role.ADMIN ? loginId : null,
          name: fullName,
          email,
          phone: get('PhoneNo') || null,
          department: getAny('Department', 'Team', 'Teams', 'TeamsID')
            ? `Department-${getAny('Department', 'Team', 'Teams', 'TeamsID')}`
            : null,
          profilePhotoUrl: getAny('ProfilePhotoUrl', 'ProfilePhoto', 'PhotoUrl', 'Photo', 'ImageUrl', 'Image') || null,
          joiningDate: normalizeImportedDate(getAny('JoiningDate', 'DateOfJoining')),
          dateOfBirth: normalizeImportedDate(getAny('DateOfBirth', 'DOB', 'BirthDate')),
          gender: getAny('Gender') || null,
          bloodGroup: getAny('BloodGroup', 'Blood Group') || null,
          emergencyContact:
            getAny(
              'EmergencyContactNo1',
              'EmergencyContact',
              'Emergency Contact',
              'EmergencyNo',
              'Emergency Number'
            ) || null,
          address: getAny('Address', 'CurrentAddress', 'PermanentAddress') || null,
          designation: get('DesignationID') ? `Designation-${get('DesignationID')}` : role === Role.HR ? 'HR' : 'Employee',
          city: get('Branch') && get('Branch') !== '0' ? get('Branch') : 'Unknown',
          workMode: parseWorkMode(get('WorkMode')),
          role,
          permissions,
          passwordHash,
          isActive: parseBooleanFlag(get('IsActive')) ?? true
        }
      });

      created += 1;
      if (legacyUserId) {
        legacyUserIdToNewId.set(legacyUserId, user.id);
        const managerLegacyUserId = get('ReportingAuthorityID');
        if (managerLegacyUserId) {
          managerLinks.push({ managerLegacyUserId, userId: user.id });
        }
      }
    }

    let managerMapped = 0;
    for (const link of managerLinks) {
      const managerId = legacyUserIdToNewId.get(link.managerLegacyUserId);
      if (!managerId || managerId === link.userId) {
        continue;
      }

      await prisma.user.update({
        where: { id: link.userId },
        data: { managerId }
      });
      managerMapped += 1;
    }

    const now = new Date();
    const previousMonthAnchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const previousMonthDates = monthDateRangeUtc(
      previousMonthAnchor.getUTCFullYear(),
      previousMonthAnchor.getUTCMonth()
    );

    const employees = await prisma.user.findMany({
      where: { isActive: true, role: Role.EMPLOYEE },
      select: { id: true }
    });

    const attendanceRows: Array<{
      date: Date;
      punchInAt: Date | null;
      punchOutAt: Date | null;
      status: AttendanceStatus;
      timezoneOffsetMinutes: number;
      userId: string;
      workingMinutes: number | null;
    }> = [];

    employees.forEach((employee) => {
      previousMonthDates.forEach((day) => {
        const dayOfWeek = day.getUTCDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const date = toDateOnlyUtc(day);

        if (isWeekend) {
          attendanceRows.push({
            userId: employee.id,
            date,
            status: AttendanceStatus.WEEKEND,
            punchInAt: null,
            punchOutAt: null,
            workingMinutes: null,
            timezoneOffsetMinutes: -330
          });
          return;
        }

        const randomValue = Math.random();
        let status: AttendanceStatus = AttendanceStatus.PRESENT;
        if (randomValue > 0.88 && randomValue <= 0.94) status = AttendanceStatus.HALF_DAY;
        if (randomValue > 0.94) status = AttendanceStatus.ABSENT;
        if (randomValue > 0.78 && randomValue <= 0.88) status = AttendanceStatus.LATE;

        if (status === AttendanceStatus.ABSENT) {
          attendanceRows.push({
            userId: employee.id,
            date,
            status,
            punchInAt: null,
            punchOutAt: null,
            workingMinutes: null,
            timezoneOffsetMinutes: -330
          });
          return;
        }

        const inHour = status === AttendanceStatus.LATE ? randomInRange(10, 11) : randomInRange(8, 10);
        const inMinute = randomInRange(0, 55);
        const punchInAt = withTimeUtc(date, inHour, inMinute);
        const workingMinutes =
          status === AttendanceStatus.HALF_DAY ? randomInRange(220, 300) : randomInRange(470, 560);
        const punchOutAt = new Date(punchInAt.getTime() + workingMinutes * 60 * 1000);

        attendanceRows.push({
          userId: employee.id,
          date,
          status,
          punchInAt,
          punchOutAt,
          workingMinutes,
          timezoneOffsetMinutes: -330
        });
      });
    });

    if (attendanceRows.length) {
      await prisma.attendanceDay.createMany({
        data: attendanceRows
      });
    }

    return {
      attendanceRowsCreated: attendanceRows.length,
      created,
      csvPasswordCount,
      fallbackPasswordCount,
      managerMapped,
      overriddenPasswordCount,
      passwordMode: options.defaultPassword ? 'fixed' : 'csv',
      skippedDuplicates
    };
  } finally {
    if (!options.prismaClient) {
      await prisma.$disconnect();
    }
  }
};
