export type AttendanceStatus =
  | 'PRESENT'
  | 'LEAVE'
  | 'ABSENT'
  | 'HALF_DAY'
  | 'LATE'
  | 'HOLIDAY'
  | 'WEEKEND'
  | 'OVERTIME'
  | 'INVALID'
  | 'UPCOMING';

export interface AttendanceDay {
  date: string;
  status: AttendanceStatus;
  punchIn?: string;
  punchOut?: string;
  punchInUtc?: string;
  punchOutUtc?: string;
  workingMinutes?: number;
  workingHours?: string;
  holidayName?: string;
  holidayImageUrl?: string;
}
