import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import { type PaginationQuery, toSkipTake } from '@/shared/utils/pagination';
import type { DateRange } from '@/shared/utils/time-zone';

export type MovementType = 'PAYMENT' | 'RELEASE';

export interface DeliveredTotals {
  cents: number;
  orders: number;
}

export interface LedgerEntry {
  at: Date;
  type: MovementType;
  orderId: string;
  buyer: string;
  seller: string;
  amountCents: number;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  total: number;
  receivedCents: number;
  releasedCents: number;
}

export interface SellerStats {
  id: string;
  listedVolumeCents: number;
  activeListings: number;
  rating: number | null;
  reviews: number;
}

export interface CardStats {
  id: string;
  averagePriceCents: number | null;
  prices: number;
}

export interface GroupStats {
  id: string;
  negotiatedVolumeCents: number;
  activeNegotiations: number;
}

export interface FinanceRepository {
  custodyCents(): Promise<number>;
  deliveredTotals(range: DateRange): Promise<DeliveredTotals>;
  ledger(day: DateRange, pagination: PaginationQuery): Promise<LedgerPage>;
  sellerStats(ids: string[]): Promise<SellerStats[]>;
  cardStats(ids: string[], since: Date): Promise<CardStats[]>;
  groupStats(ids: string[]): Promise<GroupStats[]>;
}

const approvedPaymentOf = Prisma.sql`
  FROM payments p
  JOIN orders o ON o.id = p.order_id
  WHERE p.status = 'APPROVED' AND p.deleted_at IS NULL AND o.deleted_at IS NULL`;

const movementsOf = ({ from, to }: DateRange) => Prisma.sql`
  WITH movements AS (
    SELECT p.updated_at AS at, 'PAYMENT' AS type, o.id AS order_id, o.buyer_id, o.seller_id, p.value
    ${approvedPaymentOf} AND p.updated_at >= ${from} AND p.updated_at < ${to}
    UNION ALL
    SELECT o.updated_at, 'RELEASE', o.id, o.buyer_id, o.seller_id, p.value
    ${approvedPaymentOf} AND o.status = 'DELIVERED' AND o.updated_at >= ${from} AND o.updated_at < ${to}
  )`;

type CentsRow = { cents: bigint };
type DeliveredRow = CentsRow & { orders: number };
type LedgerRow = {
  at: Date;
  type: MovementType;
  orderId: string;
  buyer: string;
  seller: string;
  cents: bigint;
};
type LedgerTotalsRow = { total: number; received: bigint; released: bigint };
type SellerRow = {
  id: string;
  volume: bigint;
  active: number;
  rating: number | null;
  reviews: number;
};
type CardRow = { id: string; average: bigint | null; prices: number };
type GroupRow = { id: string; volume: bigint; active: number };

const toLedgerEntry = ({ cents, ...entry }: LedgerRow): LedgerEntry => ({
  ...entry,
  amountCents: Number(cents),
});

export class PrismaFinanceRepository implements FinanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async custodyCents(): Promise<number> {
    const [{ cents }] = await this.prisma.$queryRaw<[CentsRow]>`
      SELECT (COALESCE(SUM(p.value), 0) * 100)::bigint AS cents
      ${approvedPaymentOf} AND o.status IN ('PAID', 'SHIPPED')`;
    return Number(cents);
  }

  async deliveredTotals({ from, to }: DateRange): Promise<DeliveredTotals> {
    const [{ cents, orders }] = await this.prisma.$queryRaw<[DeliveredRow]>`
      SELECT (COALESCE(SUM(p.value), 0) * 100)::bigint AS cents, COUNT(*)::int AS orders
      ${approvedPaymentOf} AND o.status = 'DELIVERED' AND o.updated_at >= ${from} AND o.updated_at <= ${to}`;
    return { cents: Number(cents), orders };
  }

  async ledger(day: DateRange, pagination: PaginationQuery): Promise<LedgerPage> {
    const { skip, take } = toSkipTake(pagination);
    const [rows, [{ total, received, released }]] = await Promise.all([
      this.prisma.$queryRaw<LedgerRow[]>`${movementsOf(day)}
        SELECT m.at, m.type, m.order_id AS "orderId", COALESCE(b.username, b.name) AS buyer,
               s.name AS seller, (m.value * 100)::bigint AS cents
        FROM movements m JOIN users b ON b.id = m.buyer_id JOIN users s ON s.id = m.seller_id
        ORDER BY m.at DESC, m.order_id DESC, m.type LIMIT ${take} OFFSET ${skip}`,
      this.prisma.$queryRaw<[LedgerTotalsRow]>`${movementsOf(day)}
        SELECT COUNT(*)::int AS total,
          (COALESCE(SUM(value) FILTER (WHERE type = 'PAYMENT'), 0) * 100)::bigint AS received,
          (COALESCE(SUM(value) FILTER (WHERE type = 'RELEASE'), 0) * 100)::bigint AS released
        FROM movements`,
    ]);
    return {
      entries: rows.map(toLedgerEntry),
      total,
      receivedCents: Number(received),
      releasedCents: Number(released),
    };
  }

  async sellerStats(ids: string[]): Promise<SellerStats[]> {
    const rows = await this.prisma.$queryRaw<SellerRow[]>`
      SELECT u.id::text AS id, COALESCE(l.volume, 0)::bigint AS volume, COALESCE(l.active, 0)::int AS active,
             r.rating, COALESCE(r.reviews, 0)::int AS reviews
      FROM unnest(${ids}::uuid[]) AS u(id)
      LEFT JOIN (
        SELECT seller_id, SUM(price * available_quantity) * 100 AS volume, COUNT(*) AS active
        FROM listings WHERE status = 'ACTIVE' AND deleted_at IS NULL GROUP BY seller_id
      ) l ON l.seller_id = u.id
      LEFT JOIN (
        SELECT seller_id, ROUND(AVG(rating)::numeric, 1)::float AS rating, COUNT(*) AS reviews
        FROM reviews WHERE deleted_at IS NULL GROUP BY seller_id
      ) r ON r.seller_id = u.id`;
    return rows.map(({ id, volume, active, rating, reviews }) => ({
      id,
      listedVolumeCents: Number(volume),
      activeListings: active,
      rating,
      reviews,
    }));
  }

  async cardStats(ids: string[], since: Date): Promise<CardStats[]> {
    const rows = await this.prisma.$queryRaw<CardRow[]>`
      SELECT c.id::text AS id, ROUND(AVG(ph.price) * 100)::bigint AS average, COUNT(ph.id)::int AS prices
      FROM unnest(${ids}::uuid[]) AS c(id)
      LEFT JOIN price_history ph
        ON ph.card_id = c.id AND ph.deleted_at IS NULL AND ph.reference_date >= ${since}::date
      GROUP BY c.id`;
    return rows.map(({ id, average, prices }) => ({
      id,
      averagePriceCents: average === null ? null : Number(average),
      prices,
    }));
  }

  async groupStats(ids: string[]): Promise<GroupStats[]> {
    const rows = await this.prisma.$queryRaw<GroupRow[]>`
      SELECT g.id::text AS id, (COALESCE(SUM(l.price), 0) * 100)::bigint AS volume, COUNT(l.id)::int AS active
      FROM unnest(${ids}::uuid[]) AS g(id)
      LEFT JOIN (
        SELECT DISTINCT group_id, listing_id FROM group_messages
        WHERE content_type = 'LISTING' AND listing_id IS NOT NULL AND deleted_at IS NULL
      ) gm ON gm.group_id = g.id
      LEFT JOIN listings l ON l.id = gm.listing_id AND l.status = 'ACTIVE' AND l.deleted_at IS NULL
      GROUP BY g.id`;
    return rows.map(({ id, volume, active }) => ({
      id,
      negotiatedVolumeCents: Number(volume),
      activeNegotiations: active,
    }));
  }
}
