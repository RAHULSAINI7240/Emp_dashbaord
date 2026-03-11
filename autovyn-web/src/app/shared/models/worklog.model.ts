export interface WorklogDailySummary {
  date: string;
  activeSeconds: number;
  inactiveSeconds: number;
  totalSeconds: number;
  productivityPercent: number;
}

export interface WorklogEmployeeSummary {
  user: {
    id: string;
    employeeId?: string | null;
    name: string;
    designation: string;
  };
  activeSeconds: number;
  inactiveSeconds: number;
  totalTrackedSeconds: number;
  productivityPercent: number;
  daily: WorklogDailySummary[];
  liveStatus: 'ACTIVE' | 'IDLE' | 'OFFLINE';
  lastHeartbeatAt: string | null;
  lastHeartbeatEditor: string | null;
  lastHeartbeatFocused: boolean | null;
}

export interface WorklogSummary {
  from: string;
  to: string;
  timezoneOffsetMinutes: number;
  totalActiveSeconds: number;
  totalInactiveSeconds: number;
  totalTrackedSeconds: number;
  productivityPercent: number;
  employeeCount: number;
  employees: WorklogEmployeeSummary[];
}
