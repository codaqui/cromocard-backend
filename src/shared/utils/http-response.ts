import type { Response } from 'express';

import type { PaginationMeta } from '@/shared/utils/pagination';

export function ok<T>(res: Response, data: T): void {
  res.status(200).json({ data });
}

export function created<T>(res: Response, data: T): void {
  res.status(201).json({ data });
}

export function noContent(res: Response): void {
  res.status(204).end();
}

export function paginated<T>(res: Response, data: T[], meta: PaginationMeta): void {
  res.status(200).json({ data, meta });
}
