export interface LeaveAllowances {
  casual: number;
  sick: number;
  special: number;
  emergency: number;
  total: number;
}

type LeaveAllowanceSource = {
  casualLeaveAllowance?: number | null;
  sickLeaveAllowance?: number | null;
  specialLeaveAllowance?: number | null;
  emergencyLeaveAllowance?: number | null;
};

export const DEFAULT_LEAVE_ALLOWANCES = {
  casual: 6,
  sick: 5,
  special: 6,
  emergency: 1
} as const;

const resolveAllowance = (value: number | null | undefined, fallback: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return fallback;
  }

  return value;
};

export const resolveLeaveAllowances = (source?: LeaveAllowanceSource | null): LeaveAllowances => {
  const casual = resolveAllowance(source?.casualLeaveAllowance, DEFAULT_LEAVE_ALLOWANCES.casual);
  const sick = resolveAllowance(source?.sickLeaveAllowance, DEFAULT_LEAVE_ALLOWANCES.sick);
  const special = resolveAllowance(source?.specialLeaveAllowance, DEFAULT_LEAVE_ALLOWANCES.special);
  const emergency = resolveAllowance(source?.emergencyLeaveAllowance, DEFAULT_LEAVE_ALLOWANCES.emergency);

  return {
    casual,
    sick,
    special,
    emergency,
    total: casual + sick + special + emergency
  };
};

export const toLeaveTypeAllowanceMap = (
  source?: LeaveAllowanceSource | null
): Record<'CASUAL' | 'SICK' | 'SPECIAL' | 'EMERGENCY', number> => {
  const allowances = resolveLeaveAllowances(source);

  return {
    CASUAL: allowances.casual,
    SICK: allowances.sick,
    SPECIAL: allowances.special,
    EMERGENCY: allowances.emergency
  };
};
