import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

type ParsedArgs = {
  loginId?: string;
  all?: boolean;
  password: string;
  role?: Role;
};

const parseRole = (value: string): Role => {
  if (value === 'ADMIN' || value === 'EMPLOYEE' || value === 'HR') {
    return value;
  }

  throw new Error(`Invalid role: ${value}. Expected ADMIN, EMPLOYEE, or HR.`);
};

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2);
  let loginId: string | undefined;
  let all = false;
  let password: string | undefined;
  let role: Role | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--login-id') {
      const value = args[i + 1];
      if (!value?.trim()) throw new Error('Expected a login ID after --login-id.');
      loginId = value.trim().toUpperCase();
      i += 1;
      continue;
    }

    if (arg === '--password') {
      const value = args[i + 1];
      if (!value?.trim()) throw new Error('Expected a non-empty password after --password.');
      password = value.trim();
      i += 1;
      continue;
    }

    if (arg === '--role') {
      const value = args[i + 1];
      if (!value?.trim()) throw new Error('Expected ADMIN, EMPLOYEE, or HR after --role.');
      role = parseRole(value.trim().toUpperCase());
      i += 1;
      continue;
    }

    if (arg === '--all') {
      all = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!password) {
    throw new Error(
      'Usage: tsx prisma/set-user-password.ts (--login-id <VYN001> | --all [--role <ROLE>]) --password <new-password>'
    );
  }

  if (loginId && all) {
    throw new Error('Use either --login-id or --all, not both.');
  }

  if (!loginId && !all) {
    throw new Error('Specify either --login-id <VYN001> or --all.');
  }

  return { loginId, all, password, role };
};

const main = async (): Promise<void> => {
  const { loginId, all, password, role } = parseArgs();
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);
  const passwordHash = await bcrypt.hash(password, saltRounds);

  if (loginId) {
    const matches = await prisma.user.findMany({
      where: {
        OR: [
          { employeeId: { equals: loginId, mode: 'insensitive' } },
          { adminId: { equals: loginId, mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        employeeId: true,
        adminId: true,
        role: true
      }
    });

    if (!matches.length) {
      throw new Error(`No user found with login ID ${loginId}.`);
    }

    if (matches.length > 1) {
      throw new Error(`Login ID ${loginId} is ambiguous across multiple users.`);
    }

    const target = matches[0];
    await prisma.user.update({
      where: { id: target.id },
      data: { passwordHash }
    });

    console.log(`Updated password for ${target.employeeId ?? target.adminId} (${target.role}).`);
    return;
  }

  const where = {
    ...(role ? { role } : {})
  };

  const targets = await prisma.user.findMany({
    where,
    select: {
      employeeId: true,
      adminId: true,
      role: true
    },
    take: 10
  });

  const result = await prisma.user.updateMany({
    where,
    data: { passwordHash }
  });

  console.log(`Updated password for ${result.count} user(s).`);
  if (role) {
    console.log(`Role filter: ${role}`);
  }
  if (targets.length) {
    console.log(`Sample affected login IDs: ${targets.map((item) => item.employeeId ?? item.adminId).join(', ')}`);
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
