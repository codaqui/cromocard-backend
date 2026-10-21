import type { PrismaClient } from '@/generated/prisma/client';
import type { UserRole } from '@/generated/prisma/enums';
import { NotImplementedError } from '@/shared/errors/http-errors';
import type { DateRange } from '@/shared/utils/period';

export type UsersByRole = Record<UserRole, number>;

export interface DashboardRepository {
  countUsersByRole(): Promise<UsersByRole>;
  countUsersCreatedBetween(range: DateRange): Promise<number>;
  countCards(): Promise<number>;
  countAlbums(): Promise<number>;
}

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  countUsersByRole(): Promise<UsersByRole> {
    throw new NotImplementedError();
  }

  countUsersCreatedBetween(_range: DateRange): Promise<number> {
    throw new NotImplementedError();
  }

  countCards(): Promise<number> {
    throw new NotImplementedError();
  }

  countAlbums(): Promise<number> {
    throw new NotImplementedError();
  }
}
