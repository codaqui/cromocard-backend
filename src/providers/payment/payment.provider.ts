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

export type PaymentEventType = 'completed' | 'expired' | 'ignored';

export interface PaymentEvent {
  id: string;
  type: PaymentEventType;
  sessionId?: string;
  orderId?: string;
  chargeId?: string;
}

export interface PaymentProvider {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;
  expireCheckoutSession(sessionId: string): Promise<void>;
  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): PaymentEvent;
}
