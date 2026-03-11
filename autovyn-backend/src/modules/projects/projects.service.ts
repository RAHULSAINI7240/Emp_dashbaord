import { Permission, Role } from '@prisma/client';
import { AppError } from '../../utils/app-error';
import { projectsRepository } from './projects.repository';
import { usersRepository } from '../users/users.repository';

interface AuthContext {
  userId: string;
  role: Role;
  permissions: Permission[];
}

interface SaveProjectPayload {
  name: string;
  client: string;
  summary: string;
  category: string;
  status: string;
  teamName?: string;
  frontendStack?: string;
  backendStack?: string;
  qaSummary?: string;
  supportSummary?: string;
  modules: string[];
  highlights: string[];
  memberIds: string[];
  memberRoles?: Record<string, string>;
}

const MANAGER_KEYWORDS = ['manager', 'team lead', 'lead', 'head', 'supervisor'];

const hasManagerLikeDesignation = (designation: string | null | undefined): boolean => {
  const normalized = designation?.trim().toLowerCase() ?? '';
  return MANAGER_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const canManageProjects = async (auth: AuthContext): Promise<boolean> => {
  if (auth.role === Role.ADMIN || auth.role === Role.HR) return true;
  if (auth.permissions.includes(Permission.MANAGER) || auth.permissions.includes(Permission.TEAM_LEAD)) return true;

  const user = await usersRepository.findById(auth.userId);
  if (!user || !user.isActive) return false;

  return user.teamMembers.length > 0 || hasManagerLikeDesignation(user.designation);
};

const serializeProject = (project: Awaited<ReturnType<typeof projectsRepository.findById>> extends infer T
  ? NonNullable<T>
  : never) => ({
  id: project.id,
  name: project.name,
  client: project.client,
  summary: project.summary,
  category: project.category,
  status: project.status,
  teamName: project.teamName ?? undefined,
  frontendStack: project.frontendStack ?? undefined,
  backendStack: project.backendStack ?? undefined,
  qaSummary: project.qaSummary ?? undefined,
  supportSummary: project.supportSummary ?? undefined,
  modules: project.modules,
  highlights: project.highlights,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  createdBy: {
    id: project.createdBy.id,
    name: project.createdBy.name,
    employeeId: project.createdBy.employeeId ?? undefined,
    adminId: project.createdBy.adminId ?? undefined,
    designation: project.createdBy.designation
  },
  members: project.assignments.map((assignment) => ({
    id: assignment.user.id,
    assignmentId: assignment.id,
    name: assignment.user.name,
    employeeId: assignment.user.employeeId ?? undefined,
    adminId: assignment.user.adminId ?? undefined,
    designation: assignment.user.designation,
    department: assignment.user.department ?? undefined,
    city: assignment.user.city,
    roleLabel: assignment.roleLabel ?? undefined
  }))
});

const normalizeLines = (values: string[]): string[] =>
  values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index);

const resolveAssignableIds = async (auth: AuthContext): Promise<Set<string>> => {
  const users = await projectsRepository.listAssignableUsers(auth);
  return new Set(users.map((user) => user.id));
};

const buildAssignments = (payload: SaveProjectPayload, createdById: string) => {
  const ids = normalizeLines(payload.memberIds);
  return ids.map((userId) => ({
    projectId: '',
    userId,
    roleLabel: payload.memberRoles?.[userId]?.trim() || (userId === createdById ? 'Project Owner' : undefined)
  }));
};

const validateAssignableMembers = async (payload: SaveProjectPayload, auth: AuthContext): Promise<void> => {
  const allowedIds = await resolveAssignableIds(auth);
  const invalidIds = normalizeLines(payload.memberIds).filter((userId) => !allowedIds.has(userId));
  if (invalidIds.length) {
    throw new AppError('One or more selected members are outside your allowed team scope.', 403, 'INVALID_PROJECT_SCOPE');
  }
};

const listManagedUserIds = async (managerId: string): Promise<string[]> => {
  const visited = new Set<string>();
  const queue = [managerId];

  while (queue.length) {
    const currentManagerId = queue.shift();
    if (!currentManagerId) continue;

    const directReports = await usersRepository.listDirectReportIds(currentManagerId);
    for (const report of directReports) {
      if (visited.has(report.id)) continue;
      visited.add(report.id);
      queue.push(report.id);
    }
  }

  return [...visited];
};

export const projectsService = {
  async listWorkspace(auth: AuthContext) {
    const canManage = await canManageProjects(auth);
    const managedUserIds = canManage ? await listManagedUserIds(auth.userId) : [];
    const [projects, assignableUsers] = await Promise.all([
      projectsRepository.listVisibleProjects(auth, managedUserIds),
      canManage ? projectsRepository.listAssignableUsers(auth) : Promise.resolve([])
    ]);

    return {
      canManage,
      items: projects.map((project) => serializeProject(project)),
      assignableUsers: assignableUsers.map((user) => ({
        id: user.id,
        name: user.name,
        employeeId: user.employeeId ?? undefined,
        adminId: user.adminId ?? undefined,
        designation: user.designation,
        department: user.department ?? undefined,
        city: user.city,
        managerId: user.managerId ?? undefined
      }))
    };
  },

  async createProject(payload: SaveProjectPayload, auth: AuthContext) {
    if (!(await canManageProjects(auth))) {
      throw new AppError('You do not have permission to manage projects.', 403, 'FORBIDDEN_PROJECT_CREATE');
    }

    await validateAssignableMembers(payload, auth);

    const members = new Set(normalizeLines(payload.memberIds));
    members.add(auth.userId);

    const project = await projectsRepository.createProject(
      {
        name: payload.name.trim(),
        client: payload.client.trim(),
        summary: payload.summary.trim(),
        category: payload.category.trim(),
        status: payload.status.trim(),
        teamName: payload.teamName?.trim() || undefined,
        frontendStack: payload.frontendStack?.trim() || undefined,
        backendStack: payload.backendStack?.trim() || undefined,
        qaSummary: payload.qaSummary?.trim() || undefined,
        supportSummary: payload.supportSummary?.trim() || undefined,
        modules: normalizeLines(payload.modules),
        highlights: normalizeLines(payload.highlights),
        createdById: auth.userId
      },
      buildAssignments({ ...payload, memberIds: [...members] }, auth.userId)
    );

    return serializeProject(project);
  },

  async updateProject(projectId: string, payload: SaveProjectPayload, auth: AuthContext) {
    if (!(await canManageProjects(auth))) {
      throw new AppError('You do not have permission to manage projects.', 403, 'FORBIDDEN_PROJECT_UPDATE');
    }

    const existing = await projectsRepository.findById(projectId);
    if (!existing) {
      throw new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    }

    const isPrivileged = auth.role === Role.ADMIN || auth.role === Role.HR;
    if (!isPrivileged && existing.createdById !== auth.userId) {
      throw new AppError('You can only edit projects created by you.', 403, 'PROJECT_EDIT_FORBIDDEN');
    }

    await validateAssignableMembers(payload, auth);

    const members = new Set(normalizeLines(payload.memberIds));
    members.add(existing.createdById);

    const project = await projectsRepository.updateProject(
      projectId,
      {
        name: payload.name.trim(),
        client: payload.client.trim(),
        summary: payload.summary.trim(),
        category: payload.category.trim(),
        status: payload.status.trim(),
        teamName: payload.teamName?.trim() || undefined,
        frontendStack: payload.frontendStack?.trim() || undefined,
        backendStack: payload.backendStack?.trim() || undefined,
        qaSummary: payload.qaSummary?.trim() || undefined,
        supportSummary: payload.supportSummary?.trim() || undefined,
        modules: normalizeLines(payload.modules),
        highlights: normalizeLines(payload.highlights)
      },
      buildAssignments({ ...payload, memberIds: [...members] }, existing.createdById)
    );

    return serializeProject(project);
  }
};
