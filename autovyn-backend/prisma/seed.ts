import 'dotenv/config';
import { PrismaClient, AttendanceStatus, LeaveType, MissingType, Permission, RequestStatus, Role, WorkMode } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const toUtcDate = (dateKey: string): Date => new Date(`${dateKey}T00:00:00.000Z`);
const dateKey = (value: Date): string => value.toISOString().slice(0, 10);

const addDays = (value: Date, days: number): Date => {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const startOfMonth = (value: Date): Date => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
const endOfMonth = (value: Date): Date => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0));

const enumerateDateKeys = (start: Date, end: Date): string[] => {
  const out: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(dateKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

const isWeekend = (dateString: string): boolean => {
  const day = new Date(`${dateString}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
};

const weekdayKeys = (keys: string[]): string[] => keys.filter((key) => !isWeekend(key));

async function main(): Promise<void> {
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  const adminPasswordHash = await bcrypt.hash('Admin@123', saltRounds);
  const employeePasswordHash = await bcrypt.hash('Emp@123', saltRounds);

  await prisma.refreshToken.deleteMany();
  await prisma.arsRequest.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.attendanceDay.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.policy.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: {
      adminId: 'VYN01',
      name: 'System Admin',
      email: 'admin@autovyn.com',
      phone: '9000000001',
      designation: 'Administrator',
      city: 'Pune',
      role: Role.ADMIN,
      workMode: WorkMode.WFO,
      permissions: [
        Permission.APPROVE_LEAVE,
        Permission.APPROVE_ARS,
        Permission.VIEW_TEAM,
        Permission.MANAGE_EMPLOYEES,
        Permission.CREATE_USER,
        Permission.MANAGER,
        Permission.TEAM_LEAD
      ],
      passwordHash: adminPasswordHash,
      isActive: true
    }
  });

  const manager1 = await prisma.user.create({
    data: {
      employeeId: 'VYN02',
      name: 'Ravi Kumar',
      email: 'emp1001@autovyn.com',
      phone: '9000001001',
      designation: 'Engineering Manager',
      city: 'Pune',
      role: Role.EMPLOYEE,
      workMode: WorkMode.WFO,
      permissions: [Permission.APPROVE_LEAVE, Permission.APPROVE_ARS, Permission.VIEW_TEAM, Permission.MANAGER],
      passwordHash: employeePasswordHash,
      isActive: true
    }
  });

  const manager2 = await prisma.user.create({
    data: {
      employeeId: 'VYN03',
      name: 'Neha Sharma',
      email: 'emp1002@autovyn.com',
      phone: '9000001002',
      designation: 'Team Lead',
      city: 'Mumbai',
      role: Role.EMPLOYEE,
      workMode: WorkMode.HYBRID,
      permissions: [Permission.APPROVE_LEAVE, Permission.APPROVE_ARS, Permission.VIEW_TEAM, Permission.TEAM_LEAD],
      passwordHash: employeePasswordHash,
      isActive: true
    }
  });

  const hr = await prisma.user.create({
    data: {
      employeeId: 'VYN04',
      name: 'Priya Nair',
      email: 'hr@autovyn.com',
      phone: '9000001500',
      designation: 'HR Executive',
      city: 'Pune',
      role: Role.HR,
      workMode: WorkMode.WFO,
      permissions: [Permission.CREATE_USER, Permission.VIEW_TEAM],
      passwordHash: employeePasswordHash,
      isActive: true
    }
  });

  const employees = await Promise.all(
    ['VYN05', 'VYN06', 'VYN07', 'VYN08', 'VYN09'].map((employeeId, index) =>
      prisma.user.create({
        data: {
          employeeId,
          name: `Employee ${index + 1}`,
          email: `${employeeId.toLowerCase()}@autovyn.com`,
          phone: `90000020${index + 1}`,
          designation: 'Software Engineer',
          city: index % 2 === 0 ? 'Pune' : 'Mumbai',
          role: Role.EMPLOYEE,
          workMode: index % 2 === 0 ? WorkMode.WFO : WorkMode.WFH,
          permissions: [Permission.VIEW_TEAM],
          managerId: index < 3 ? manager1.id : manager2.id,
          passwordHash: employeePasswordHash,
          isActive: true
        }
      })
    )
  );

  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);
  const previousMonthStart = startOfMonth(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const previousMonthEnd = endOfMonth(previousMonthStart);

  const monthKeys = [
    ...enumerateDateKeys(previousMonthStart, previousMonthEnd),
    ...enumerateDateKeys(currentMonthStart, currentMonthEnd)
  ];

  const roster = [admin, manager1, manager2, hr, ...employees];
  for (const user of roster) {
    await prisma.attendanceDay.createMany({
      data: monthKeys.map((key) => ({
        userId: user.id,
        date: toUtcDate(key),
        status: isWeekend(key) ? AttendanceStatus.WEEKEND : AttendanceStatus.ABSENT,
        timezoneOffsetMinutes: -330
      }))
    });
  }

  const prevWeekdays = weekdayKeys(enumerateDateKeys(addDays(now, -10), addDays(now, -1)));
  for (const user of [manager1, manager2, ...employees]) {
    for (const key of prevWeekdays.slice(0, 5)) {
      const punchInAt = new Date(`${key}T09:25:00.000Z`);
      const punchOutAt = new Date(`${key}T18:05:00.000Z`);
      await prisma.attendanceDay.upsert({
        where: {
          userId_date: {
            userId: user.id,
            date: toUtcDate(key)
          }
        },
        update: {
          status: AttendanceStatus.PRESENT,
          punchInAt,
          punchOutAt,
          workingMinutes: 520,
          timezoneOffsetMinutes: -330
        },
        create: {
          userId: user.id,
          date: toUtcDate(key),
          status: AttendanceStatus.PRESENT,
          punchInAt,
          punchOutAt,
          workingMinutes: 520,
          timezoneOffsetMinutes: -330
        }
      });
    }
  }

  const approvedLeaveDates = prevWeekdays.slice(5, 7).map((d) => dateKey(new Date(d)));
  const pendingLeaveDates = weekdayKeys(enumerateDateKeys(addDays(now, 3), addDays(now, 4)));
  const expiredLeaveDates = weekdayKeys(enumerateDateKeys(addDays(now, -20), addDays(now, -19)));

  await prisma.leaveRequest.create({
    data: {
      employeeId: employees[0].id,
      approverId: manager1.id,
      type: LeaveType.CASUAL,
      reason: 'Family event',
      dates: pendingLeaveDates,
      startDate: toUtcDate(pendingLeaveDates[0]),
      endDate: toUtcDate(pendingLeaveDates[pendingLeaveDates.length - 1]),
      status: RequestStatus.PENDING
    }
  });

  await prisma.leaveRequest.create({
    data: {
      employeeId: employees[1].id,
      approverId: manager1.id,
      type: LeaveType.SICK,
      reason: 'Fever and doctor advised rest',
      dates: approvedLeaveDates,
      startDate: toUtcDate(approvedLeaveDates[0]),
      endDate: toUtcDate(approvedLeaveDates[approvedLeaveDates.length - 1]),
      status: RequestStatus.APPROVED,
      comment: 'Take care and recover soon.',
      actedAt: addDays(now, -6)
    }
  });

  await prisma.leaveRequest.create({
    data: {
      employeeId: employees[2].id,
      approverId: manager1.id,
      type: LeaveType.EMERGENCY,
      reason: 'Urgent personal work',
      dates: expiredLeaveDates,
      startDate: toUtcDate(expiredLeaveDates[0]),
      endDate: toUtcDate(expiredLeaveDates[expiredLeaveDates.length - 1]),
      status: RequestStatus.EXPIRED,
      comment: 'No action taken before leave date.'
    }
  });

  await prisma.arsRequest.create({
    data: {
      employeeId: employees[3].id,
      approverId: admin.id,
      date: toUtcDate(dateKey(addDays(now, -2))),
      missingType: MissingType.MISSING_OUT,
      reason: 'Forgot to punch out while leaving office',
      status: RequestStatus.PENDING
    }
  });

  await prisma.arsRequest.create({
    data: {
      employeeId: employees[4].id,
      approverId: manager2.id,
      date: toUtcDate(dateKey(addDays(now, -3))),
      missingType: MissingType.MISSING_IN,
      reason: 'Biometric device was offline in morning',
      status: RequestStatus.APPROVED,
      correctedPunchInAt: new Date(`${dateKey(addDays(now, -3))}T09:45:00.000Z`),
      correctedPunchOutAt: new Date(`${dateKey(addDays(now, -3))}T18:10:00.000Z`),
      comment: 'Approved with corrected punch-in.',
      actedAt: addDays(now, -2)
    }
  });

  await prisma.announcement.createMany({
    data: [
      {
        title: 'Townhall on Friday',
        body: 'Monthly townhall at 4 PM in cafeteria and online stream.',
        createdById: admin.id
      },
      {
        title: 'Attendance Policy Update',
        body: 'Please submit ARS requests within 48 hours of missing punch.',
        createdById: admin.id
      }
    ]
  });

  await prisma.holiday.createMany({
    data: [
      {
        date: toUtcDate(`${now.getUTCFullYear()}-01-26`),
        name: 'Republic Day',
        createdById: admin.id
      },
      {
        date: toUtcDate(`${now.getUTCFullYear()}-08-15`),
        name: 'Independence Day',
        createdById: admin.id
      }
    ]
  });

  await prisma.policy.create({
    data: {
      attendancePolicy: '# Attendance Policy\n\n- Punch in by 10:00 AM\n- Raise ARS within 48 hours for missing punch',
      leavePolicy: '# Leave Policy\n\n- Apply in advance where possible\n- Emergency leaves should be informed to manager immediately',
      casualLeaveAllowance: 6,
      sickLeaveAllowance: 5,
      specialLeaveAllowance: 6,
      emergencyLeaveAllowance: 1,
      createdById: admin.id
    }
  });

  console.log('Seed complete with admin, managers, HR, employees, attendance, leave, and ARS sample data.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
