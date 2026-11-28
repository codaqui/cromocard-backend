import { AppError } from '@/shared/errors/app-error';

export class ShippingProviderError extends AppError {
  constructor() {
    super({
      statusCode: 502,
      code: 'SHIPPING_PROVIDER_ERROR',
      message: 'Não foi possível calcular o frete agora. Tente novamente em instantes.',
    });
  }
}
