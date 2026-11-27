export interface CheckoutLineItem {
  name: string;
  amountInCents: number;
  quantity: number;
}

export interface CreateCheckoutSessionInput {
  orderId: string;
  lineItems: CheckoutLineItem[];
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
  customerEmail?: string;
}

export interface CheckoutSession {
  id: string;
  url: string;
}

export type PaymentEventType = 'completed' | 'expired' | 'account-updated' | 'ignored';

export interface ConnectedAccount {
  id: string;
  detailsSubmitted: boolean;
  transfersEnabled: boolean;
  requirementsDue: number;
  disabledReason: string | null;
}

export interface OnboardingLinkInput {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
}

export interface PaymentEvent {
  id: string;
  type: PaymentEventType;
  sessionId?: string;
  orderId?: string;
  chargeId?: string;
  account?: ConnectedAccount;
}

export interface PaymentProvider {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;
  expireCheckoutSession(sessionId: string): Promise<void>;
  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): Promise<PaymentEvent>;
  createConnectedAccount(input: { email: string }): Promise<{ id: string }>;
  createOnboardingLink(input: OnboardingLinkInput): Promise<string>;
  getConnectedAccount(accountId: string): Promise<ConnectedAccount>;
}
