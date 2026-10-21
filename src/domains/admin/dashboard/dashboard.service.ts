import { NotImplementedError } from '@/shared/errors/http-errors';
import type { Period } from '@/shared/utils/period';

import type { DashboardRepository, UsersByRole } from './dashboard.repository';
import type { DashboardQuery } from './dashboard.validator';

export interface DashboardSummary {
  period: Period;
  users: {
    total: number;
    byRole: UsersByRole;
    newInPeriod: number;
  };
  catalog: {
    totalCards: number;
    totalAlbums: number;
  };
  pendingCatalogRequests: number;
}

export class DashboardService {
  constructor(private readonly dashboardRepository: DashboardRepository) {}

  getSummary(_query: DashboardQuery): Promise<DashboardSummary> {
    throw new NotImplementedError();
  }
}
