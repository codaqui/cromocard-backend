/** Uma linha do checkout (ex.: a carta e o frete), com o valor em centavos de real. */
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
  /** Página de pagamento para onde o comprador é levado. */
  url: string;
}

/**
 * Evento do webhook já traduzido: `completed` (pago), `expired` (sessão expirou ou o pagamento assíncrono falhou)
 * e `ignored` para o que o marketplace não trata (ex.: boleto ainda não pago).
 */
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

/** Gateway de pagamento (ADR-009, ADR-066): Stripe Checkout em homologação e produção, versão falsa no PC e nos testes. */
export interface PaymentProvider {
  createCheckoutSession(input: CreateCheckoutSessionInput): Promise<CheckoutSession>;
  expireCheckoutSession(sessionId: string): Promise<void>;
  /** Confere a assinatura do webhook; assinatura inválida lança `InvalidSignatureError`. */
  parseWebhookEvent(rawBody: Buffer, signature: string | undefined): PaymentEvent;
  createConnectedAccount(input: { email: string }): Promise<{ id: string }>;
  createOnboardingLink(input: OnboardingLinkInput): Promise<string>;
  getConnectedAccount(accountId: string): Promise<ConnectedAccount>;
}
