import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { AttendanceStatus, Permission, PrismaClient, Role, WorkMode } from '@prisma/client';

const prisma = new PrismaClient();
const ADMIN_LOGIN_IDS = new Set(['VYNCOO', 'VYNCFO', 'VYNCTO', 'VYNCEO']);
const HR_LOGIN_IDS = new Set(['VYN210', 'VYN142']);
const MANAGER_LOGIN_IDS = new Set(['VYN075']);

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
  return rows.filter((r) => r.some((v) => v.length > 0));
};

const parseWorkMode = (raw: string): WorkMode => {
  const v = normalize(raw);
  if (v === '1') return WorkMode.WFO;
  if (v === '2') return WorkMode.HYBRID;
  if (v === '3') return WorkMode.WFH;
  return WorkMode.WFO;
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

const resolveRole = (loginId: string): Role => {
  if (ADMIN_LOGIN_IDS.has(loginId)) return Role.ADMIN;
  if (HR_LOGIN_IDS.has(loginId)) return Role.HR;
  return Role.EMPLOYEE;
};

const toDateOnlyUtc = (value: Date): Date => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

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

const parseArgs = (): { csvPath: string; defaultPassword?: string } => {
  const args = process.argv.slice(2);
  const csvPath = args[0];
  if (!csvPath) {
    throw new Error('Usage: tsx prisma/import-users-from-csv.ts <csv-path> [--default-password <password>]');
  }

  let defaultPassword: string | undefined;
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--default-password') {
      const value = args[i + 1];
      if (!value?.trim()) {
        throw new Error('Expected a non-empty value after --default-password.');
      }
      defaultPassword = value.trim();
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { csvPath, defaultPassword };
};

const main = async (): Promise<void> => {
  const { csvPath, defaultPassword } = parseArgs();

  const absolutePath = path.resolve(csvPath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`CSV file not found: ${absolutePath}`);
  }

  const content = fs.readFileSync(absolutePath, 'utf8');
  const rows = parseCsv(content);
  if (rows.length < 2) throw new Error('CSV has no data rows.');

  const headers = rows[0];
  const dataRows = rows.slice(1);
  const headerIndex = new Map(headers.map((h, i) => [h, i]));
  const normalizedHeaderIndex = new Map(headers.map((h, i) => [normalizeHeader(h), i]));

  const resolveIndex = (name: string): number | undefined =>
    headerIndex.get(name) ?? normalizedHeaderIndex.get(normalizeHeader(name));

  const requiredCols = ['Userid', 'UserName', 'UserPassword', 'FullName', 'PhoneNo', 'OfficialEmailID', 'EmailID', 'DesignationID', 'Branch', 'IsActive', 'IsReportingAuthority', 'WorkMode', 'ReportingAuthorityID'];
  for (const col of requiredCols) {
    if (resolveIndex(col) === undefined) throw new Error(`Missing expected column: ${col}`);
  }

  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  const seenEmails = new Set<string>();
  const seenLoginIds = new Set<string>();
  const legacyUserIdToNewId = new Map<string, string>();
  const managerLinks: Array<{ userId: string; managerLegacyUserId: string }> = [];

  // Fresh import for live user list.
  await prisma.refreshToken.deleteMany();
  await prisma.arsRequest.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.attendanceDay.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.user.updateMany({ data: { managerId: null } });
  await prisma.user.deleteMany();

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
      for (const key of aliases) {
        const value = get(key);
        if (value) return value;
      }
      return '';
    };

    const legacyUserId = get('Userid');
    const loginId = get('UserName').toUpperCase();
    if (!loginId) continue;
    if (seenLoginIds.has(loginId)) {
      skippedDuplicates += 1;
      continue;
    }
    seenLoginIds.add(loginId);

    const fullName = get('FullName') || loginId;
    const rawPassword = get('UserPassword');
    const passwordText = defaultPassword ?? rawPassword || loginId;
    if (defaultPassword) {
      overriddenPasswordCount += 1;
    } else if (rawPassword) {
      csvPasswordCount += 1;
    } else {
      fallbackPasswordCount += 1;
    }
    const passwordHash = await bcrypt.hash(passwordText, saltRounds);

    const role = resolveRole(loginId);
    const isReportingAuthority = get('IsReportingAuthority') === '1' || MANAGER_LOGIN_IDS.has(loginId);
    const permissions = resolvePermissions(role, isReportingAuthority);

    const rawEmail = (get('OfficialEmailID') || get('EmailID')).toLowerCase();
    let email: string | null = rawEmail || null;
    if (email) {
      if (seenEmails.has(email)) email = null;
      else seenEmails.add(email);
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
        dateOfBirth: getAny('DateOfBirth', 'DOB', 'BirthDate') || null,
        gender: getAny('Gender') || null,
        bloodGroup: getAny('BloodGroup', 'Blood Group') || null,
        emergencyContact: getAny('EmergencyContact', 'Emergency Contact', 'EmergencyNo', 'Emergency Number') || null,
        address: getAny('Address', 'CurrentAddress', 'PermanentAddress') || null,
        designation: get('DesignationID') ? `Designation-${get('DesignationID')}` : role === Role.HR ? 'HR' : 'Employee',
        city: get('Branch') || 'Unknown',
        workMode: parseWorkMode(get('WorkMode')),
        role,
        permissions,
        passwordHash,
        // User asked that everyone in the provided list must be able to log in.
        isActive: true
      }
    });

    created += 1;
    if (legacyUserId) {
      legacyUserIdToNewId.set(legacyUserId, user.id);
      const managerLegacyUserId = get('ReportingAuthorityID');
      if (managerLegacyUserId) {
        managerLinks.push({ userId: user.id, managerLegacyUserId });
      }
    }
  }

  let managerMapped = 0;
  for (const link of managerLinks) {
    const managerId = legacyUserIdToNewId.get(link.managerLegacyUserId);
    if (!managerId || managerId === link.userId) continue;
    await prisma.user.update({
      where: { id: link.userId },
      data: { managerId }
    });
    managerMapped += 1;
  }

  // Build previous-month random attendance for all active employees.
  const now = new Date();
  const prevMonthAnchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthDates = monthDateRangeUtc(prevMonthAnchor.getUTCFullYear(), prevMonthAnchor.getUTCMonth());

  const employees = await prisma.user.findMany({
    where: { isActive: true, role: Role.EMPLOYEE },
    select: { id: true }
  });

  const attendanceRows: Array<{
    userId: string;
    date: Date;
    status: AttendanceStatus;
    punchInAt: Date | null;
    punchOutAt: Date | null;
    workingMinutes: number | null;
    timezoneOffsetMinutes: number;
  }> = [];

  employees.forEach((employee) => {
    prevMonthDates.forEach((day) => {
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

      const r = Math.random();
      let status: AttendanceStatus = AttendanceStatus.PRESENT;
      if (r > 0.88 && r <= 0.94) status = AttendanceStatus.HALF_DAY;
      if (r > 0.94) status = AttendanceStatus.ABSENT;
      if (r > 0.78 && r <= 0.88) status = AttendanceStatus.LATE;

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

      const workMinutes = status === AttendanceStatus.HALF_DAY ? randomInRange(220, 300) : randomInRange(470, 560);
      const punchOutAt = new Date(punchInAt.getTime() + workMinutes * 60 * 1000);

      attendanceRows.push({
        userId: employee.id,
        date,
        status,
        punchInAt,
        punchOutAt,
        workingMinutes: workMinutes,
        timezoneOffsetMinutes: -330
      });
    });
  });

  if (attendanceRows.length) {
    await prisma.attendanceDay.createMany({
      data: attendanceRows
    });
  }

  console.log(`Imported users: ${created}`);
  console.log(`Manager links mapped: ${managerMapped}`);
  console.log(`Skipped duplicate loginIds: ${skippedDuplicates}`);
  console.log(`Previous month attendance rows created: ${attendanceRows.length}`);
  if (defaultPassword) {
    console.log(`Password mode: fixed default password for all imported users.`);
    console.log(`Users assigned default password: ${overriddenPasswordCount}`);
  } else {
    console.log(`Password mode: CSV UserPassword with loginId fallback when blank.`);
    console.log(`Users using CSV password: ${csvPasswordCount}`);
    console.log(`Users falling back to loginId password: ${fallbackPasswordCount}`);
    console.log('Tip: pass --default-password <password> during import if you want one known password for all imported users.');
  }
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
