export const todayIso = (): string => new Date().toISOString().slice(0, 10);

export const formatLongDate = (isoDate: string): string => {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

export const isPastDate = (isoDate: string): boolean => {
  const input = new Date(isoDate);
  input.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return input.getTime() < now.getTime();
};

export const monthDays = (year: number, month: number): string[] => {
  const last = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => {
    const d = new Date(year, month, i + 1);
    return d.toISOString().slice(0, 10);
  });
};
