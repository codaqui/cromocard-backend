import { AppError } from '@/shared/errors/app-error';

export class PaymentProviderError extends AppError {
  constructor() {
    super({
      statusCode: 502,
      code: 'PAYMENT_PROVIDER_ERROR',
      message: 'Não foi possível falar com o gateway de pagamento. Tente novamente em instantes.',
    });
  }
}

export class InvalidSignatureError extends AppError {
  constructor() {
    super({
      statusCode: 400,
      code: 'INVALID_SIGNATURE',
      message: 'Assinatura do webhook inválida',
    });
  }
}
