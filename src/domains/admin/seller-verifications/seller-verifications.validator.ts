import { z } from '@/lib/zod';
import { paginationQuerySchema } from '@/shared/utils/pagination';
import { reasonSchema } from '@/shared/validators/reason';

const sellerVerificationStatusSchema = z.enum(['UNDER_REVIEW', 'PENDING', 'APPROVED', 'REJECTED']);

export const listSellerVerificationsQuerySchema = paginationQuerySchema.extend({
  status: sellerVerificationStatusSchema.optional(),
});

export const sellerVerificationIdParamSchema = z.object({
  id: z.uuid(),
});

export const sellerDocumentParamsSchema = z.object({
  id: z.uuid(),
  documentId: z.uuid(),
});

export const addNoteSchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

export const approveSchema = z.object({
  reason: reasonSchema.optional(),
});

export const rejectSchema = z.object({
  reason: reasonSchema,
});

export type ListSellerVerificationsQuery = z.infer<typeof listSellerVerificationsQuerySchema>;
export type SellerVerificationStatus = z.infer<typeof sellerVerificationStatusSchema>;
export type AddNoteInput = z.infer<typeof addNoteSchema>;
export type ApproveInput = z.infer<typeof approveSchema>;
export type RejectInput = z.infer<typeof rejectSchema>;
