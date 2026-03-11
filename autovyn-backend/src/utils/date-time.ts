import { AppError } from './app-error';

export const parseTimezoneOffset = (raw?: unknown): number => {
  if (raw === undefined || raw === null || raw === '') return 0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < -840 || value > 840) {
    throw new AppError('Invalid timezone offset.', 400, 'INVALID_TIMEZONE_OFFSET');
  }
  return Math.trunc(value);
};

export const getDateKeyFromOffset = (date: Date, timezoneOffsetMinutes: number): string => {
  const localMs = date.getTime() - timezoneOffsetMinutes * 60_000;
  return new Date(localMs).toISOString().slice(0, 10);
};

export const getTimeFromOffset = (date: Date, timezoneOffsetMinutes: number): string => {
  const localMs = date.getTime() - timezoneOffsetMinutes * 60_000;
  return new Date(localMs).toISOString().slice(11, 16);
};

export const dateKeyToUtcDate = (dateKey: string): Date => new Date(`${dateKey}T00:00:00.000Z`);

export const formatUtcDateToKey = (date: Date): string => date.toISOString().slice(0, 10);

export const validateMonthFormat = (month: string): void => {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new AppError('Month must be in YYYY-MM format.', 400, 'INVALID_MONTH_FORMAT');
  }
};

export const validateDateFormat = (date: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError('Date must be in YYYY-MM-DD format.', 400, 'INVALID_DATE_FORMAT');
  }
};

export const monthStartEnd = (month: string): { start: Date; end: Date } => {
  validateMonthFormat(month);
  const [year, monthNum] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNum - 1, 1));
  const end = new Date(Date.UTC(year, monthNum, 0));
  return { start, end };
};

export const enumerateMonthDateKeys = (month: string): string[] => {
  const { start, end } = monthStartEnd(month);
  const cursor = new Date(start);
  const out: string[] = [];
  while (cursor <= end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

export const isWeekend = (dateKey: string): boolean => {
  const day = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
};

export const minutesBetween = (start: Date, end: Date): number => Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60_000));

export const minutesToHHMM = (minutes?: number | null): string | null => {
  if (minutes === null || minutes === undefined) return null;
  const hrs = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const mins = (minutes % 60).toString().padStart(2, '0');
  return `${hrs}:${mins}`;
};

export const compareDateKeys = (a: string, b: string): number => {
  if (a === b) return 0;
  return a > b ? 1 : -1;
};

export const normalizeAndSortDates = (dates: string[]): string[] => {
  const unique = Array.from(new Set(dates));
  unique.forEach(validateDateFormat);
  return unique.sort();
};

export const parseIsoDateTime = (value: string): Date => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new AppError('Invalid datetime format, expected ISO string.', 400, 'INVALID_DATETIME_FORMAT');
  }
  return date;
};
