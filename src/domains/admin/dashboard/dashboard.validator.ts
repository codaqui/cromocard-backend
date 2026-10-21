import { z } from '@/lib/zod';
import { periodSchema } from '@/shared/utils/period';

export const dashboardQuerySchema = z.object({
  period: periodSchema.default('LAST_30_DAYS'),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
