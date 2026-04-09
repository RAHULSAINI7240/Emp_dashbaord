import { Permission, Prisma, Role } from '@prisma/client';
import { prisma } from '../db/prisma';
import { bootstrapCoreUsersEnabled, env } from '../config/env';
import { hashPassword } from '../utils/password';
import { defaultDesignationByRole, defaultPermissionsByRole, normalizeWorkMode } from '../utils/user-defaults';

interface BootstrappedUserPayload {
  loginId: string;
  password: string;
  role: Role;
  name: string;
  department: string;
  designation: string;
  city: string;
  joiningDate: string | null;
  email?: string | null;
  permissions: Permission[];
  managerLoginId?: string;
  workMode: 'WFO' | 'WFH' | 'HYBRID';
}

const DEFAULT_CORE_LOGIN_IDS = {
  admin: 'VYN01',
  hr: 'VYN02',
  manager: 'VYN03'
} as const;

const DEFAULT_CORE_PASSWORDS = {
  admin: 'Admin@123',
  hr: 'Hr@12345',
  manager: 'Manager@123'
} as const;

const MANAGER_PERMISSIONS: Permission[] = [
  Permission.APPROVE_LEAVE,
  Permission.APPROVE_ARS,
  Permission.VIEW_TEAM,
  Permission.MANAGER
];

const normalizeLoginId = (value: string): string => value.trim().toUpperCase();

const findUsersByLoginId = (loginId: string) =>
  prisma.user.findMany({
    where: {
      OR: [
        { adminId: { equals: loginId, mode: 'insensitive' } },
        { employeeId: { equals: loginId, mode: 'insensitive' } }
      ]
    },
    select: {
      id: true
    }
  });

const buildUserData = async (
  payload: BootstrappedUserPayload,
  managerId: string | null
): Promise<Prisma.UserUncheckedCreateInput> => ({
  adminId: payload.role === Role.ADMIN ? payload.loginId : null,
  employeeId: payload.role !== Role.ADMIN ? payload.loginId : null,
  name: payload.name,
  email: payload.email ?? null,
  phone: null,
  department: payload.department,
  profilePhotoUrl: null,
  joiningDate: payload.joiningDate,
  dateOfBirth: null,
  gender: null,
  bloodGroup: null,
  emergencyContact: null,
  address: null,
  designation: payload.designation,
  city: payload.city,
  workMode: payload.workMode,
  role: payload.role,
  permissions: payload.permissions,
  managerId,
  passwordHash: await hashPassword(payload.password),
  isActive: true
});

const ensureBootstrappedUser = async (
  payload: BootstrappedUserPayload,
  managerId: string | null
): Promise<{ id: string; loginId: string }> => {
  const data = await buildUserData(payload, managerId);
  const matches = await findUsersByLoginId(payload.loginId);

  if (matches.length > 1) {
    throw new Error(`Bootstrap login ID ${payload.loginId} matches multiple existing users.`);
  }

  const user = matches.length
    ? await prisma.user.update({
        where: { id: matches[0].id },
        data: data as Prisma.UserUncheckedUpdateInput
      })
    : await prisma.user.create({
        data
      });

  return {
    id: user.id,
    loginId: payload.loginId
  };
};

const resolveCoreUserPayloads = (): BootstrappedUserPayload[] => {
  if (!bootstrapCoreUsersEnabled) {
    return [];
  }

  const adminLoginId = normalizeLoginId(env.BOOTSTRAP_ADMIN_LOGIN_ID ?? DEFAULT_CORE_LOGIN_IDS.admin);
  const hrLoginId = normalizeLoginId(env.BOOTSTRAP_HR_LOGIN_ID ?? DEFAULT_CORE_LOGIN_IDS.hr);
  const managerLoginId = normalizeLoginId(env.BOOTSTRAP_MANAGER_LOGIN_ID ?? DEFAULT_CORE_LOGIN_IDS.manager);

  const payloads: BootstrappedUserPayload[] = [
    {
      loginId: adminLoginId,
      password: env.BOOTSTRAP_ADMIN_PASSWORD?.trim() || DEFAULT_CORE_PASSWORDS.admin,
      role: Role.ADMIN,
      name: 'Autovyn Admin',
      department: 'Administration',
      designation: defaultDesignationByRole(Role.ADMIN),
      city: 'Remote',
      joiningDate: '2026-01-01',
      email: null,
      permissions: defaultPermissionsByRole(Role.ADMIN),
      workMode: 'WFO'
    },
    {
      loginId: hrLoginId,
      password: env.BOOTSTRAP_HR_PASSWORD?.trim() || DEFAULT_CORE_PASSWORDS.hr,
      role: Role.HR,
      name: 'Autovyn HR',
      department: 'Human Resources',
      designation: defaultDesignationByRole(Role.HR),
      city: 'Remote',
      joiningDate: '2026-01-02',
      email: null,
      permissions: defaultPermissionsByRole(Role.HR),
      managerLoginId: adminLoginId,
      workMode: 'WFO'
    },
    {
      loginId: managerLoginId,
      password: env.BOOTSTRAP_MANAGER_PASSWORD?.trim() || DEFAULT_CORE_PASSWORDS.manager,
      role: Role.EMPLOYEE,
      name: 'Autovyn Manager',
      department: 'Operations',
      designation: 'Reporting Manager',
      city: 'Remote',
      joiningDate: '2026-01-03',
      email: null,
      permissions: MANAGER_PERMISSIONS,
      managerLoginId: adminLoginId,
      workMode: 'WFO'
    }
  ];

  const loginIds = payloads.map((payload) => payload.loginId);
  if (new Set(loginIds).size !== loginIds.length) {
    console.warn('Skipping core-user bootstrap because one or more configured login IDs are duplicated.');
    return [];
  }

  return payloads;
};

const resolveDemoPayload = (): BootstrappedUserPayload | null => {
  const loginId = env.DEMO_LOGIN_ID?.trim();
  const password = env.DEMO_PASSWORD?.trim();

  if (!loginId && !password) {
    return null;
  }

  if (!loginId || !password) {
    console.warn('Skipping demo-user bootstrap because DEMO_LOGIN_ID and DEMO_PASSWORD must both be set.');
    return null;
  }

  const role = env.DEMO_ROLE ?? Role.ADMIN;

  return {
    loginId: normalizeLoginId(loginId),
    password,
    role,
    name: env.DEMO_NAME?.trim() || 'Autovyn Demo',
    department: 'Demo',
    designation: env.DEMO_DESIGNATION?.trim() || defaultDesignationByRole(role),
    city: env.DEMO_CITY?.trim() || 'Remote',
    joiningDate: env.DEMO_JOINING_DATE?.trim() || null,
    email: null,
    permissions: defaultPermissionsByRole(role),
    workMode: normalizeWorkMode(env.DEMO_WORK_MODE)
  };
};

const bootstrapCoreUsers = async (): Promise<Set<string>> => {
  const payloads = resolveCoreUserPayloads();
  if (!payloads.length) {
    return new Set();
  }

  const usersByLoginId = new Map<string, { id: string; loginId: string }>();
  for (const payload of payloads) {
    const managerId = payload.managerLoginId ? usersByLoginId.get(payload.managerLoginId)?.id ?? null : null;
    const user = await ensureBootstrappedUser(payload, managerId);
    usersByLoginId.set(payload.loginId, user);
  }

  console.log(`Core login accounts ensured: ${payloads.map((payload) => payload.loginId).join(', ')}`);
  return new Set(payloads.map((payload) => payload.loginId));
};

const bootstrapDemoUser = async (reservedLoginIds: Set<string>): Promise<void> => {
  const payload = resolveDemoPayload();
  if (!payload) return;

  if (reservedLoginIds.has(payload.loginId)) {
    console.warn(`Skipping demo-user bootstrap because ${payload.loginId} is already reserved by core-user bootstrap.`);
    return;
  }

  await ensureBootstrappedUser(payload, null);
  console.log(`Demo user ensured for login ID ${payload.loginId}.`);
};

export const bootstrapStartupUsers = async (): Promise<void> => {
  const reservedLoginIds = await bootstrapCoreUsers();
  await bootstrapDemoUser(reservedLoginIds);
};
