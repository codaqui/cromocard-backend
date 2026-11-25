import type { StripeAccountStatus } from '@/generated/prisma/enums';
import type { ConnectedAccount } from '@/providers/payment/payment.provider';

export type StripeAccountState = StripeAccountStatus | 'NOT_CONNECTED';
export type PendingReason = 'NOT_SUBMITTED' | 'MORE_INFO_REQUIRED' | 'REJECTED';

export interface StripeAccountView {
  status: StripeAccountState;
  pendingReason: PendingReason | null;
}

const PENDING_VERIFICATION = 'requirements.pending_verification';
const REJECTED_PREFIX = 'rejected.';

function isBlockedByStripe({ disabledReason }: ConnectedAccount): boolean {
  return disabledReason !== null && disabledReason !== PENDING_VERIFICATION;
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
