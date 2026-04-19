import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const DEFAULT_LOGIN_IDS = ['EMP1006', 'EMP1007', 'EMP1008', 'VYN01', 'VYN02', 'VYN03'] as const;

interface ParsedArgs {
  apply: boolean;
  loginIds: string[];
}

const parseArgs = (): ParsedArgs => {
  const loginIds: string[] = [];
  let apply = false;

  for (const arg of process.argv.slice(2)) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }

    loginIds.push(arg.trim().toUpperCase());
  }

  return {
    apply,
    loginIds: Array.from(new Set(loginIds.length ? loginIds : DEFAULT_LOGIN_IDS))
  };
};

const prisma = new PrismaClient();

const buildWhere = (loginIds: string[]) => ({
  OR: [
    { employeeId: { in: loginIds } },
    { adminId: { in: loginIds } }
  ]
});

const main = async (): Promise<void> => {
  const { apply, loginIds } = parseArgs();
  const users = await prisma.user.findMany({
    where: buildWhere(loginIds),
    select: {
      id: true,
      name: true,
      role: true,
      employeeId: true,
      adminId: true,
      isActive: true
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }]
  });

  if (!users.length) {
    console.log('No matching users found.');
    return;
  }

  const impact = await Promise.all(
    users.map(async (user) => {
      const [directReports, projectAssignments, createdProjects, ownedCredentials, screenshots, workHeartbeats] = await Promise.all([
        prisma.user.count({ where: { managerId: user.id, isActive: true } }),
        prisma.projectAssignment.count({ where: { userId: user.id } }),
        prisma.project.count({ where: { createdById: user.id } }),
        prisma.credential.count({ where: { ownerUserId: user.id } }),
        prisma.screenshot.count({ where: { userId: user.id } }),
        prisma.workHeartbeat.count({ where: { userId: user.id } })
      ]);

      return {
        loginId: user.employeeId ?? user.adminId ?? user.id,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        directReports,
        projectAssignments,
        createdProjects,
        ownedCredentials,
        screenshots,
        workHeartbeats
      };
    })
  );

  console.log('Matched users:');
  impact.forEach((item) => {
    console.log(
      `- ${item.loginId} | ${item.name} | ${item.role} | active=${item.isActive} | reports=${item.directReports} | assignments=${item.projectAssignments} | projects=${item.createdProjects} | credentials=${item.ownedCredentials} | screenshots=${item.screenshots} | heartbeats=${item.workHeartbeats}`
    );
  });

  if (!apply) {
    console.log('');
    console.log('Dry run only. Re-run with --apply to disable these users and revoke their refresh tokens.');
    return;
  }

  const userIds = users.map((user) => user.id);
  const now = new Date();

  const [disabledUsers, revokedTokens] = await Promise.all([
    prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { isActive: false }
    }),
    prisma.refreshToken.updateMany({
      where: {
        userId: { in: userIds },
        revokedAt: null
      },
      data: { revokedAt: now }
    })
  ]);

  console.log('');
  console.log(`Disabled users: ${disabledUsers.count}`);
  console.log(`Revoked refresh tokens: ${revokedTokens.count}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
