import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { Permission, Prisma, PrismaClient, Role, WorkMode } from '@prisma/client';

interface CoreUserDefinition {
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

const parseBooleanFlag = (value?: string): boolean | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed.toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;

  return undefined;
};

const normalizeLoginId = (value: string): string => value.trim().toUpperCase();

const MANAGER_PERMISSIONS: Permission[] = [
  Permission.APPROVE_LEAVE,
  Permission.APPROVE_ARS,
  Permission.VIEW_TEAM,
  Permission.MANAGER
];

const buildCoreUsers = (): CoreUserDefinition[] => [
  {
    label: 'Admin',
    loginId: normalizeLoginId(process.env.BOOTSTRAP_ADMIN_LOGIN_ID ?? 'VYN01'),
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim() || 'Admin@123',
    role: Role.ADMIN,
    name: 'Autovyn Admin',
    email: 'admin@autovyn.local',
    department: 'Administration',
    designation: 'Administrator',
    city: 'Remote',
    workMode: WorkMode.WFO,
    joiningDate: '2026-01-01',
    permissions: [
      Permission.APPROVE_LEAVE,
      Permission.APPROVE_ARS,
      Permission.VIEW_TEAM,
      Permission.MANAGE_EMPLOYEES,
      Permission.CREATE_USER,
      Permission.MANAGER,
      Permission.TEAM_LEAD
    ]
  },
  {
    label: 'HR',
    loginId: normalizeLoginId(process.env.BOOTSTRAP_HR_LOGIN_ID ?? 'VYN02'),
    password: process.env.BOOTSTRAP_HR_PASSWORD?.trim() || 'Hr@12345',
    role: Role.HR,
    name: 'Autovyn HR',
    email: 'hr@autovyn.local',
    department: 'Human Resources',
    designation: 'HR Executive',
    city: 'Remote',
    workMode: WorkMode.WFO,
    joiningDate: '2026-01-02',
    permissions: [Permission.CREATE_USER, Permission.VIEW_TEAM],
    managerLoginId: normalizeLoginId(process.env.BOOTSTRAP_ADMIN_LOGIN_ID ?? 'VYN01')
  },
  {
    label: 'Manager',
    loginId: normalizeLoginId(process.env.BOOTSTRAP_MANAGER_LOGIN_ID ?? 'VYN03'),
    password: process.env.BOOTSTRAP_MANAGER_PASSWORD?.trim() || 'Manager@123',
    role: Role.EMPLOYEE,
    name: 'Autovyn Manager',
    email: 'manager@autovyn.local',
    department: 'Operations',
    designation: 'Reporting Manager',
    city: 'Remote',
    workMode: WorkMode.WFO,
    joiningDate: '2026-01-03',
    permissions: MANAGER_PERMISSIONS,
    managerLoginId: normalizeLoginId(process.env.BOOTSTRAP_ADMIN_LOGIN_ID ?? 'VYN01')
  }
];

const buildLoginMatchWhere = (loginId: string): Prisma.UserWhereInput => ({
  OR: [
    { adminId: { equals: loginId, mode: 'insensitive' } },
    { employeeId: { equals: loginId, mode: 'insensitive' } }
  ]
});

const buildUserData = (
  account: CoreUserDefinition,
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

async function main(): Promise<void> {
  const bootstrapEnabled = parseBooleanFlag(process.env.BOOTSTRAP_CORE_USERS) ?? true;
  if (!bootstrapEnabled) {
    console.log('Skipping core-user registration because BOOTSTRAP_CORE_USERS is disabled.');
    return;
  }

  const prisma = new PrismaClient();

  try {
    const coreUsers = buildCoreUsers();
    const loginIds = coreUsers.map((account) => account.loginId);
    if (new Set(loginIds).size !== loginIds.length) {
      throw new Error('Core user login IDs must be unique.');
    }

    const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
    const ensuredUsers = new Map<string, { id: string }>();

    for (const account of coreUsers) {
      const managerId = account.managerLoginId ? ensuredUsers.get(account.managerLoginId)?.id ?? null : null;
      const passwordHash = await bcrypt.hash(account.password, saltRounds);
      const data = buildUserData(account, passwordHash, managerId);

      const matches = await prisma.user.findMany({
        where: buildLoginMatchWhere(account.loginId),
        select: { id: true }
      });

      if (matches.length > 1) {
        throw new Error(`Core login ID ${account.loginId} matches multiple users. Resolve duplicates first.`);
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
      console.log(`Ensured ${account.label} user ${account.loginId}.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
