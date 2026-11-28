import { describe, expect, it } from 'vitest';

import type { ConnectedAccount } from '@/providers/payment/payment.provider';

import { pendingReasonOf, statusOf, viewOf } from './connected-accounts.status';

const account = (changes: Partial<ConnectedAccount> = {}): ConnectedAccount => ({
  id: 'acct_1',
  detailsSubmitted: false,
  transfersEnabled: false,
  requirementsDue: 0,
  disabledReason: null,
  ...changes,
});

describe('statusOf', () => {
  it('CA4: transferências liberadas é READY, mesmo com pendência futura', () => {
    expect(
      statusOf(account({ detailsSubmitted: true, transfersEnabled: true, requirementsDue: 2 })),
    ).toBe('READY');
  });

  it('CA3: cadastro enviado, sem pendência, em análise na Stripe é VERIFYING', () => {
    expect(statusOf(account({ detailsSubmitted: true }))).toBe('VERIFYING');
    expect(
      statusOf(
        account({ detailsSubmitted: true, disabledReason: 'requirements.pending_verification' }),
      ),
    ).toBe('VERIFYING');
  });

  it('CA6: cadastro não enviado é PENDING', () => {
    expect(statusOf(account())).toBe('PENDING');
  });

  it('CA7: cadastro enviado com pedido de informação ou bloqueio é PENDING', () => {
    expect(statusOf(account({ detailsSubmitted: true, requirementsDue: 1 }))).toBe('PENDING');
    expect(
      statusOf(account({ detailsSubmitted: true, disabledReason: 'requirements.past_due' })),
    ).toBe('PENDING');
  });

  it('CA12: conta que perde as transferências volta a PENDING', () => {
    expect(
      statusOf(
        account({
          detailsSubmitted: true,
          transfersEnabled: false,
          disabledReason: 'requirements.past_due',
        }),
      ),
    ).toBe('PENDING');
  });
});

describe('pendingReasonOf', () => {
  it('distingue cadastro não enviado, pedido de informação e recusa', () => {
    expect(pendingReasonOf(account())).toBe('NOT_SUBMITTED');
    expect(pendingReasonOf(account({ detailsSubmitted: true, requirementsDue: 1 }))).toBe(
      'MORE_INFO_REQUIRED',
    );
    expect(
      pendingReasonOf(account({ detailsSubmitted: true, disabledReason: 'rejected.fraud' })),
    ).toBe('REJECTED');
  });
});

describe('viewOf', () => {
  it('só traz o motivo quando a conta está PENDING', () => {
    expect(viewOf(account({ detailsSubmitted: true }))).toEqual({
      status: 'VERIFYING',
      pendingReason: null,
    });
    expect(viewOf(account())).toEqual({ status: 'PENDING', pendingReason: 'NOT_SUBMITTED' });
  });
});
