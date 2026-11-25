import { BusinessRuleError, NotFoundError, ValidationError } from '@/shared/errors/http-errors';

export class StripeAccountNotReadyError extends BusinessRuleError {
  constructor() {
    super('Conecte sua conta de recebimento antes de anunciar', 'STRIPE_ACCOUNT_NOT_READY');
  }
}

export class PrimaryAddressRequiredError extends BusinessRuleError {
  constructor() {
    super(
      'Cadastre seu endereço principal antes de anunciar. Ele é a origem do frete.',
      'PRIMARY_ADDRESS_REQUIRED',
    );
  }
}

export class ListingCardNotFoundError extends NotFoundError {
  constructor() {
    super('Carta não encontrada no catálogo', 'CARD_NOT_FOUND');
  }
}

export class CardConditionNotFoundError extends NotFoundError {
  constructor() {
    super('Condição da carta não encontrada', 'CARD_CONDITION_NOT_FOUND');
  }
}

export class ForeignListingPhotoError extends ValidationError {
  constructor() {
    super([{ field: 'photoUrls', message: 'Envie as fotos pelo upload do anúncio' }]);
  }
}
