import { Permission, Role } from './user.model';

export interface AuthSession {
  token: string;
  refreshToken?: string;
  userId: string;
  roles: Role[];
  permissions: Permission[];
}
