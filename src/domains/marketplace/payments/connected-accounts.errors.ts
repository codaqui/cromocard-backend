import { BusinessRuleError, NotFoundError } from '@/shared/errors/http-errors';

export class StripeAccountNotFoundError extends NotFoundError {
  constructor() {
    super('Você ainda não conectou uma conta de recebimento', 'STRIPE_ACCOUNT_NOT_FOUND');
  }
}

export class StripeAccountNotReadyError extends BusinessRuleError {
  constructor() {
    super('Conecte sua conta de recebimento antes de anunciar', 'STRIPE_ACCOUNT_NOT_READY');
  }
}
