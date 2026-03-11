export type TimesheetStatus = 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED' | 'REVIEW';

export interface TimesheetEntry {
  id: string;
  userId: string;
  date: string;
  ticketId: string;
  taskTitle: string;
  taskDetails: string;
  workHours: number;
  status: TimesheetStatus;
  aiTool: string;
  aiHours: number;
  aiUsageSummary: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimesheetEntryInput {
  date: string;
  ticketId: string;
  taskTitle: string;
  taskDetails: string;
  workHours: number;
  status: TimesheetStatus;
  aiTool: string;
  aiHours: number;
  aiUsageSummary: string;
}
