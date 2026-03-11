import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from '../config/constants';

export interface PaginationInput {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const getPagination = (input: PaginationInput): { page: number; limit: number; skip: number } => {
  const page = Number.isFinite(input.page) && (input.page ?? 0) > 0 ? Number(input.page) : DEFAULT_PAGE;
  const limitBase = Number.isFinite(input.limit) && (input.limit ?? 0) > 0 ? Number(input.limit) : DEFAULT_LIMIT;
  const limit = Math.min(limitBase, MAX_LIMIT);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const buildPaginationMeta = (page: number, limit: number, total: number): PaginationMeta => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});
