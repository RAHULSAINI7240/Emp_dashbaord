import { Permission, Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: Role;
        permissions: Permission[];
        employeeId: string | null;
        adminId: string | null;
      };
      timezoneOffsetMinutes?: number;
    }
  }
}

export {};
