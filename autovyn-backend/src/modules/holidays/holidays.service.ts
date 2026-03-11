import { dateKeyToUtcDate } from '../../utils/date-time';
import { holidaysRepository } from './holidays.repository';

export const holidaysService = {
  async create(payload: { date: string; name: string; imageUrl?: string }, createdById: string) {
    return holidaysRepository.create({
      date: dateKeyToUtcDate(payload.date),
      name: payload.name,
      imageUrl: payload.imageUrl,
      createdById
    });
  },

  async listByYear(year: number) {
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year, 11, 31));

    const rows = await holidaysRepository.listByYear(start, end);
    return {
      year,
      items: rows.map((row) => ({
        ...row,
        date: row.date.toISOString().slice(0, 10)
      }))
    };
  }
};
