import type { ConnectedAccount, PaymentProvider } from '@/providers/payment/payment.provider';
import { UnauthorizedError } from '@/shared/errors/http-errors';

import {
  StripeAccountNotFoundError,
  StripeAccountNotReadyError,
} from './connected-accounts.errors';
import type { ConnectedAccountsRepository, SellerAccount } from './connected-accounts.repository';
import {
  pendingReasonOf,
  statusOf,
  type StripeAccountView,
  viewOf,
} from './connected-accounts.status';

export type ConnectedAccountsProvider = Pick<
  PaymentProvider,
  'createConnectedAccount' | 'createOnboardingLink' | 'getConnectedAccount'
>;

export interface OnboardingUrls {
  returnUrl: string;
  refreshUrl: string;
}

export interface ConnectedAccountsDeps {
  repository: ConnectedAccountsRepository;
  provider: ConnectedAccountsProvider;
  urls: OnboardingUrls;
}

const NOT_CONNECTED: StripeAccountView = { status: 'NOT_CONNECTED', pendingReason: null };

export class ConnectedAccountsService {
  constructor(private readonly deps: ConnectedAccountsDeps) {}

  async getAccount(sellerId: string): Promise<StripeAccountView> {
    const { stripeAccountId, stripeAccountStatus } = await this.sellerOf(sellerId);
    if (!stripeAccountId || !stripeAccountStatus) return NOT_CONNECTED;
    if (stripeAccountStatus !== 'PENDING')
      return { status: stripeAccountStatus, pendingReason: null };
    return { status: 'PENDING', pendingReason: await this.pendingReasonOf(stripeAccountId) };
  }

  async createOnboardingLink(sellerId: string): Promise<{ url: string }> {
    const accountId = await this.accountIdCreatingIfMissing(sellerId);
    const url = await this.deps.provider.createOnboardingLink({ accountId, ...this.deps.urls });
    return { url };
  }

  async refresh(sellerId: string): Promise<StripeAccountView> {
    const { stripeAccountId } = await this.sellerOf(sellerId);
    if (!stripeAccountId) throw new StripeAccountNotFoundError();
    const account = await this.deps.provider.getConnectedAccount(stripeAccountId);
    await this.deps.repository.saveStatus(sellerId, statusOf(account));
    return viewOf(account);
  }

  async applyAccountUpdate(account: ConnectedAccount): Promise<boolean> {
    const updated = await this.deps.repository.saveStatusByAccount(account.id, statusOf(account));
    return updated > 0;
  }

  async assertReady(sellerId: string): Promise<void> {
    const { stripeAccountStatus } = await this.sellerOf(sellerId);
    if (stripeAccountStatus !== 'READY') throw new StripeAccountNotReadyError();
  }

  private async sellerOf(sellerId: string): Promise<SellerAccount> {
    const seller = await this.deps.repository.findSeller(sellerId);
    if (!seller) throw new UnauthorizedError();
    return seller;
  }

  private async accountIdCreatingIfMissing(sellerId: string): Promise<string> {
    const { email, stripeAccountId } = await this.sellerOf(sellerId);
    if (stripeAccountId) return stripeAccountId;
    const { id } = await this.deps.provider.createConnectedAccount({ email });
    await this.deps.repository.linkAccount(sellerId, id);
    return id;
  }

  private pendingReasonOf(stripeAccountId: string) {
    return this.deps.provider
      .getConnectedAccount(stripeAccountId)
      .then(pendingReasonOf)
      .catch(() => null);
  }
}
