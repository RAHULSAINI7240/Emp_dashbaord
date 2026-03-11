import { RequestStatus } from './leave.model';

export type MissingType = 'MISSING_PUNCH_IN' | 'MISSING_PUNCH_OUT' | 'BOTH';

export interface ARSRequest {
  id: string;
  employeeId: string;
  approverId: string;
  date: string;
  missingType: MissingType;
  reason: string;
  status: RequestStatus;
  createdAt: string;
  comment?: string;
}
