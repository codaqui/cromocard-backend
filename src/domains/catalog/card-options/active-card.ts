import type { Prisma } from '@/generated/prisma/client';
import { notDeleted } from '@/shared/utils/soft-delete';

export const activeCardWhere = {
  ...notDeleted,
  AND: [
    { OR: [{ albumId: null }, { album: notDeleted }] },
    { OR: [{ categoryId: null }, { category: notDeleted }] },
  ],
} satisfies Prisma.CardWhereInput;
