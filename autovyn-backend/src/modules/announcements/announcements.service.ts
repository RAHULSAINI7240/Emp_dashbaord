import { buildPaginationMeta, getPagination } from '../../utils/pagination';
import { announcementsRepository } from './announcements.repository';

export const announcementsService = {
  async create(payload: { title: string; body: string; imageUrl?: string }, createdById: string) {
    return announcementsRepository.create({
      title: payload.title,
      body: payload.body,
      imageUrl: payload.imageUrl,
      createdById
    });
  },

  async list(query: { page?: number; limit?: number }) {
    const { page, limit, skip } = getPagination(query);

    const [rows, total] = await Promise.all([
      announcementsRepository.list(skip, limit),
      announcementsRepository.count()
    ]);

    return {
      items: rows,
      pagination: buildPaginationMeta(page, limit, total)
    };
  }
};
