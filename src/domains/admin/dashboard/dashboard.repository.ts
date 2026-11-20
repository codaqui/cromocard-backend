import { Prisma, type PrismaClient } from '@/generated/prisma/client';
import type { DateRange } from '@/shared/utils/time-zone';

import type { EvolutionBucket } from './dashboard.evolution';

export interface EvolutionPoint {
  at: Date;
  collectors: number;
  sellers: number;
}

export interface EvolutionQuery {
  range: DateRange;
  bucket: EvolutionBucket;
  timeZone: string;
}

export interface DashboardRepository {
  countSignupsEvolution(query: EvolutionQuery): Promise<EvolutionPoint[]>;
}

function bucketSeries({ range: { from, to }, bucket, timeZone }: EvolutionQuery): Prisma.Sql {
  return Prisma.sql`
    SELECT generate_series(
             date_trunc(${bucket}, ${from}::timestamptz AT TIME ZONE ${timeZone}),
             date_trunc(${bucket}, ${to}::timestamptz AT TIME ZONE ${timeZone}),
             ('1 ' || ${bucket})::interval
           ) AS local_start`;
}

function collectorsByBucket({ range: { from, to }, bucket, timeZone }: EvolutionQuery) {
  return Prisma.sql`
    SELECT date_trunc(${bucket}, created_at AT TIME ZONE ${timeZone}) AS local_start,
           count(*)::int AS total
      FROM users
     WHERE deleted_at IS NULL
       AND role = 'CUSTOMER'
       AND created_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
     GROUP BY 1`;
}

function certifiedSellersByBucket({ range: { from, to }, bucket, timeZone }: EvolutionQuery) {
  return Prisma.sql`
    SELECT date_trunc(${bucket}, reviewed_at AT TIME ZONE ${timeZone}) AS local_start,
           count(*)::int AS total
      FROM seller_verifications
     WHERE deleted_at IS NULL
       AND status = 'APPROVED'
       AND reviewed_at BETWEEN ${from}::timestamptz AND ${to}::timestamptz
     GROUP BY 1`;
}

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  countSignupsEvolution(query: EvolutionQuery): Promise<EvolutionPoint[]> {
    const { timeZone } = query;
    return this.prisma.$queryRaw<EvolutionPoint[]>`
      WITH buckets AS (${bucketSeries(query)}),
      collectors AS (${collectorsByBucket(query)}),
      sellers AS (${certifiedSellersByBucket(query)})
      SELECT buckets.local_start AT TIME ZONE ${timeZone} AS at,
             coalesce(collectors.total, 0) AS collectors,
             coalesce(sellers.total, 0) AS sellers
        FROM buckets
        LEFT JOIN collectors USING (local_start)
        LEFT JOIN sellers USING (local_start)
       ORDER BY buckets.local_start`;
  }
}
