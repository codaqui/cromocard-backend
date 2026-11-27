import type { StripeAccountStatus } from '@/generated/prisma/enums';
import { z } from '@/lib/zod';
import type { ConnectedAccount } from '@/providers/payment/payment.provider';

export const stripeAccountStateSchema = z.enum(['NOT_CONNECTED', 'PENDING', 'VERIFYING', 'READY']);
export const pendingReasonSchema = z.enum(['NOT_SUBMITTED', 'MORE_INFO_REQUIRED', 'REJECTED']);

export type StripeAccountState = z.infer<typeof stripeAccountStateSchema>;
export type PendingReason = z.infer<typeof pendingReasonSchema>;

export interface StripeAccountView {
  status: StripeAccountState;
  pendingReason: PendingReason | null;
}

const REVIEW_REASONS: ReadonlySet<string> = new Set([
  'requirements.pending_verification',
  'under_review',
]);
const REJECTED_PREFIX = 'rejected.';

function isBlockedByStripe({ disabledReason }: ConnectedAccount): boolean {
  return disabledReason !== null && !REVIEW_REASONS.has(disabledReason);
}

function isUnderReview(account: ConnectedAccount): boolean {
  return account.detailsSubmitted && account.requirementsDue === 0 && !isBlockedByStripe(account);
}

export function statusOf(account: ConnectedAccount): StripeAccountStatus {
  if (account.transfersEnabled) return 'READY';
  return isUnderReview(account) ? 'VERIFYING' : 'PENDING';
}

export function pendingReasonOf(account: ConnectedAccount): PendingReason {
  if (account.disabledReason?.startsWith(REJECTED_PREFIX)) return 'REJECTED';
  return account.detailsSubmitted ? 'MORE_INFO_REQUIRED' : 'NOT_SUBMITTED';
}

export function viewOf(account: ConnectedAccount): StripeAccountView {
  const status = statusOf(account);
  return { status, pendingReason: status === 'PENDING' ? pendingReasonOf(account) : null };
}
