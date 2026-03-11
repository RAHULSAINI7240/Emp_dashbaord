export type LeaveType = 'CASUAL' | 'SICK' | 'SPECIAL' | 'EMERGENCY' | 'HALF_DAY';
export type LeaveDuration = 'FULL_DAY' | 'HALF_DAY';
export type HalfDaySession = 'FIRST_HALF' | 'SECOND_HALF';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'DECLINED' | 'EXPIRED';

export interface LeaveRequest {
  id: string;
  employeeId: string;
  approverId: string;
  type: LeaveType;
  duration: LeaveDuration;
  halfDaySession?: HalfDaySession;
  reason: string;
  dates: string[];
  status: RequestStatus;
  createdAt: string;
  comment?: string;
}

export interface LeaveSummary {
  totalAllowance: number;
  totalTaken: number;
  approvedTaken: number;
  pendingTaken: number;
  totalRemaining: number;
  totalOverdrawn: number;
  byType: {
    CASUAL: { allowed: number; taken: number; approved: number; pending: number; remaining: number; overdrawn: number };
    SICK: { allowed: number; taken: number; approved: number; pending: number; remaining: number; overdrawn: number };
    SPECIAL: { allowed: number; taken: number; approved: number; pending: number; remaining: number; overdrawn: number };
    EMERGENCY: { allowed: number; taken: number; approved: number; pending: number; remaining: number; overdrawn: number };
  };
}
