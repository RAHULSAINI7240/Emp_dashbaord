import { Role } from '@prisma/client';
import { AppError } from '../../utils/app-error';
import { usersRepository } from '../users/users.repository';
import { credentialsRepository } from './credentials.repository';

interface AuthContext {
  userId: string;
  role: Role;
}

interface SaveCredentialPayload {
  ownerUserId: string;
  systemName: string;
  credentialLabel: string;
  loginId: string;
  password: string;
  accessUrl?: string;
  notes?: string;
}

const canManageCredentials = (auth: AuthContext): boolean => auth.role === Role.ADMIN || auth.role === Role.HR;

const ensureManageAccess = (auth: AuthContext): void => {
  if (!canManageCredentials(auth)) {
    throw new AppError('Only admin or HR can manage credentials.', 403, 'FORBIDDEN_CREDENTIAL_MANAGE');
  }
};

const serializeCredential = (credential: Awaited<ReturnType<typeof credentialsRepository.findById>> extends infer T ? NonNullable<T> : never) => ({
  id: credential.id,
  ownerUserId: credential.ownerUserId,
  systemName: credential.systemName,
  credentialLabel: credential.credentialLabel,
  loginId: credential.loginId,
  password: credential.password,
  accessUrl: credential.accessUrl ?? undefined,
  notes: credential.notes ?? undefined,
  createdAt: credential.createdAt,
  updatedAt: credential.updatedAt,
  createdByUserId: credential.createdByUserId
});

export const credentialsService = {
  async list(auth: AuthContext) {
    const rows = await credentialsRepository.listVisible(canManageCredentials(auth) ? undefined : auth.userId);
    return rows.map((row) => serializeCredential(row));
  },

  async create(payload: SaveCredentialPayload, auth: AuthContext) {
    ensureManageAccess(auth);

    const owner = await usersRepository.findById(payload.ownerUserId);
    if (!owner || !owner.isActive) {
      throw new AppError('Credential owner not found.', 404, 'CREDENTIAL_OWNER_NOT_FOUND');
    }

    const created = await credentialsRepository.create({
      ownerUserId: payload.ownerUserId,
      systemName: payload.systemName.trim(),
      credentialLabel: payload.credentialLabel.trim(),
      loginId: payload.loginId.trim(),
      password: payload.password.trim(),
      accessUrl: payload.accessUrl?.trim() || undefined,
      notes: payload.notes?.trim() || undefined,
      createdByUserId: auth.userId
    });

    return serializeCredential(created);
  },

  async update(id: string, payload: SaveCredentialPayload, auth: AuthContext) {
    ensureManageAccess(auth);

    const existing = await credentialsRepository.findById(id);
    if (!existing) {
      throw new AppError('Credential not found.', 404, 'CREDENTIAL_NOT_FOUND');
    }

    const owner = await usersRepository.findById(payload.ownerUserId);
    if (!owner || !owner.isActive) {
      throw new AppError('Credential owner not found.', 404, 'CREDENTIAL_OWNER_NOT_FOUND');
    }

    const updated = await credentialsRepository.update(id, {
      ownerUserId: payload.ownerUserId,
      systemName: payload.systemName.trim(),
      credentialLabel: payload.credentialLabel.trim(),
      loginId: payload.loginId.trim(),
      password: payload.password.trim(),
      accessUrl: payload.accessUrl?.trim() || undefined,
      notes: payload.notes?.trim() || undefined
    });

    return serializeCredential(updated);
  },

  async delete(id: string, auth: AuthContext) {
    ensureManageAccess(auth);

    const existing = await credentialsRepository.findById(id);
    if (!existing) {
      throw new AppError('Credential not found.', 404, 'CREDENTIAL_NOT_FOUND');
    }

    await credentialsRepository.delete(id);
    return { deleted: true };
  }
};
