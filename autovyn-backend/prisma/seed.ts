import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Permission, Prisma, PrismaClient, Role, WorkMode } from '@prisma/client';
import { importUsersFromCsv, resolveBundledDummyUsersCsvPath } from './import-users';

interface SeedAccountDefinition {
  label: string;
  loginId: string;
  password: string;
  role: Role;
  name: string;
  email: string;
  department: string;
  designation: string;
  city: string;
  workMode: WorkMode;
  joiningDate: string;
  permissions: Permission[];
  managerLoginId?: string;
}

const ADMIN_PERMISSIONS: Permission[] = [
  Permission.APPROVE_LEAVE,
  Permission.APPROVE_ARS,
  Permission.VIEW_TEAM,
  Permission.MANAGE_EMPLOYEES,
  Permission.CREATE_USER,
  Permission.MANAGER,
  Permission.TEAM_LEAD
];

const HR_PERMISSIONS: Permission[] = [Permission.CREATE_USER, Permission.VIEW_TEAM];

const MANAGER_PERMISSIONS: Permission[] = [
  Permission.APPROVE_LEAVE,
  Permission.APPROVE_ARS,
  Permission.VIEW_TEAM,
  Permission.MANAGER
];

const SEED_ACCOUNTS: SeedAccountDefinition[] = [
  {
    label: 'Admin',
    loginId: 'VYN01',
    password: 'Admin@123',
    role: Role.ADMIN,
    name: 'Autovyn Admin',
    email: 'admin@autovyn.local',
    department: 'Administration',
    designation: 'Administrator',
    city: 'Mumbai',
    workMode: WorkMode.WFO,
    joiningDate: '2024-01-01',
    permissions: ADMIN_PERMISSIONS
  },
  {
    label: 'HR',
    loginId: 'VYN02',
    password: 'Hr@12345',
    role: Role.HR,
    name: 'Autovyn HR',
    email: 'hr@autovyn.local',
    department: 'Human Resources',
    designation: 'HR Executive',
    city: 'Mumbai',
    workMode: WorkMode.WFO,
    joiningDate: '2024-01-02',
    permissions: HR_PERMISSIONS,
    managerLoginId: 'VYN01'
  },
  {
    label: 'Manager',
    loginId: 'VYN03',
    password: 'Manager@123',
    role: Role.EMPLOYEE,
    name: 'Autovyn Manager',
    email: 'manager@autovyn.local',
    department: 'Operations',
    designation: 'Reporting Manager',
    city: 'Mumbai',
    workMode: WorkMode.WFO,
    joiningDate: '2024-01-03',
    permissions: MANAGER_PERMISSIONS,
    managerLoginId: 'VYN01'
  }
];

const buildLoginMatchWhere = (loginId: string): Prisma.UserWhereInput => ({
  OR: [
    { adminId: { equals: loginId, mode: 'insensitive' } },
    { employeeId: { equals: loginId, mode: 'insensitive' } }
  ]
});

const buildUserData = (
  account: SeedAccountDefinition,
  passwordHash: string,
  managerId: string | null
): Prisma.UserUncheckedCreateInput => ({
  adminId: account.role === Role.ADMIN ? account.loginId : null,
  employeeId: account.role === Role.ADMIN ? null : account.loginId,
  name: account.name,
  email: account.email,
  phone: null,
  department: account.department,
  profilePhotoUrl: null,
  joiningDate: account.joiningDate,
  dateOfBirth: null,
  gender: null,
  bloodGroup: null,
  emergencyContact: null,
  address: null,
  designation: account.designation,
  city: account.city,
  workMode: account.workMode,
  role: account.role,
  permissions: account.permissions,
  managerId,
  passwordHash,
  isActive: true
});

const ensurePrivilegedSeedAccounts = async (
  prisma: PrismaClient
): Promise<{ accounts: SeedAccountDefinition[]; assignedReports: number }> => {
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  const ensuredUsers = new Map<string, { id: string }>();

  for (const account of SEED_ACCOUNTS) {
    const managerId = account.managerLoginId ? ensuredUsers.get(account.managerLoginId)?.id ?? null : null;
    const passwordHash = await bcrypt.hash(account.password, saltRounds);
    const data = buildUserData(account, passwordHash, managerId);

    const matches = await prisma.user.findMany({
      where: buildLoginMatchWhere(account.loginId),
      select: { id: true }
    });

    if (matches.length > 1) {
      throw new Error(`Seed login ID ${account.loginId} matches multiple users. Resolve duplicates before seeding.`);
    }

    const user = matches.length
      ? await prisma.user.update({
          where: { id: matches[0].id },
          data
        })
      : await prisma.user.create({
          data
        });

    ensuredUsers.set(account.loginId, { id: user.id });
  }

  const manager = ensuredUsers.get('VYN03');
  if (!manager) {
    return { accounts: SEED_ACCOUNTS, assignedReports: 0 };
  }

  const protectedUserIds = Array.from(ensuredUsers.values(), (user) => user.id);
  const reportCandidates = await prisma.user.findMany({
    where: {
      isActive: true,
      role: Role.EMPLOYEE,
      managerId: null,
      id: { notIn: protectedUserIds }
    },
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true },
    take: 5
  });

  if (!reportCandidates.length) {
    return { accounts: SEED_ACCOUNTS, assignedReports: 0 };
  }

  await prisma.user.updateMany({
    where: {
      id: { in: reportCandidates.map((user) => user.id) }
    },
    data: {
      managerId: manager.id
    }
  });

  return { accounts: SEED_ACCOUNTS, assignedReports: reportCandidates.length };
};

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const csvPath = resolveBundledDummyUsersCsvPath();
    const result = await importUsersFromCsv({ csvPath, prismaClient: prisma });
    const privilegedAccounts = await ensurePrivilegedSeedAccounts(prisma);

    console.log(`Database seeded from bundled dummy CSV: ${csvPath}`);
    console.log(`Imported users: ${result.created}`);
    console.log(`Manager links mapped from CSV: ${result.managerMapped}`);
    console.log(`Previous month attendance rows created: ${result.attendanceRowsCreated}`);
    console.log('Privileged seed accounts ready:');
    privilegedAccounts.accounts.forEach((account) => {
      console.log(`- ${account.label}: ${account.loginId} / ${account.password}`);
    });

    if (privilegedAccounts.assignedReports > 0) {
      console.log(`Assigned ${privilegedAccounts.assignedReports} unmapped employees to manager VYN03.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
