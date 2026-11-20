import { CatalogRequestType, RequestStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';
import { reasonBodySchema } from '@/shared/validators/reason';

const catalogRequestTypeSchema = z.enum(CatalogRequestType);
const requestStatusSchema = z.enum(RequestStatus);

export const listCatalogRequestsQuerySchema = paginationQuerySchema.extend({
  type: catalogRequestTypeSchema.optional(),
  status: requestStatusSchema.default('PENDING'),
});

export const catalogRequestIdParamSchema = z.object({
  id: z.uuid(),
});

export const rejectCatalogRequestSchema = reasonBodySchema;

export type ListCatalogRequestsQuery = z.infer<typeof listCatalogRequestsQuerySchema>;
export type CatalogRequestIdParam = z.infer<typeof catalogRequestIdParamSchema>;
export type RejectCatalogRequestInput = z.infer<typeof rejectCatalogRequestSchema>;
