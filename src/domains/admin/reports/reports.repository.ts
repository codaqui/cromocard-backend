import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import type { UserRole } from '@/generated/prisma/enums';
import { notDeleted } from '@/shared/utils/soft-delete';
import type { DateRange } from '@/shared/utils/time-zone';

export type SignupRow = {
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
};

export type CatalogItemKind = 'CARD' | 'ALBUM';

export type CatalogRow = {
  kind: CatalogItemKind;
  name: string;
  number: string | null;
  album: string | null;
  franchise: string | null;
  createdAt: Date;
};

export interface ReportRows<T> {
  rows: T[];
  total: number;
}

export interface ReportsRepository {
  findSignups(range: DateRange, limit?: number): Promise<ReportRows<SignupRow>>;
  findCatalog(range: DateRange, limit?: number): Promise<ReportRows<CatalogRow>>;
}

const newestFirst = { createdAt: 'desc' } as const;

const cardSelect = {
  name: true,
  number: true,
  createdAt: true,
  album: { select: { title: true } },
  category: { select: { name: true } },
} satisfies Prisma.CardSelect;

const albumSelect = {
  title: true,
  createdAt: true,
  category: { select: { name: true } },
} satisfies Prisma.AlbumSelect;

type CardRecord = Prisma.CardGetPayload<{ select: typeof cardSelect }>;
type AlbumRecord = Prisma.AlbumGetPayload<{ select: typeof albumSelect }>;

function createdWithin({ from, to }: DateRange) {
  return { ...notDeleted, createdAt: { gte: from, lte: to } };
}

function toCardRow({ name, number, createdAt, album, category }: CardRecord): CatalogRow {
  const franchise = category?.name ?? null;
  return { kind: 'CARD', name, number, album: album?.title ?? null, franchise, createdAt };
}

function toAlbumRow({ title, createdAt, category }: AlbumRecord): CatalogRow {
  const franchise = category?.name ?? null;
  return { kind: 'ALBUM', name: title, number: null, album: null, franchise, createdAt };
}

function byNewest(first: CatalogRow, second: CatalogRow): number {
  return second.createdAt.getTime() - first.createdAt.getTime();
}

export class PrismaReportsRepository implements ReportsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findSignups(range: DateRange, limit?: number): Promise<ReportRows<SignupRow>> {
    const where = {
      ...createdWithin(range),
      role: { not: 'ADMIN' },
    } satisfies Prisma.UserWhereInput;
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: { name: true, email: true, role: true, createdAt: true },
        orderBy: newestFirst,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { rows, total };
  }

  async findCatalog(range: DateRange, limit?: number): Promise<ReportRows<CatalogRow>> {
    const where = createdWithin(range);
    const [cards, albums, cardsTotal, albumsTotal] = await this.prisma.$transaction([
      this.prisma.card.findMany({ where, select: cardSelect, orderBy: newestFirst, take: limit }),
      this.prisma.album.findMany({ where, select: albumSelect, orderBy: newestFirst, take: limit }),
      this.prisma.card.count({ where }),
      this.prisma.album.count({ where }),
    ]);
    const rows = [...cards.map(toCardRow), ...albums.map(toAlbumRow)].sort(byNewest);
    return { rows: rows.slice(0, limit), total: cardsTotal + albumsTotal };
  }
}
