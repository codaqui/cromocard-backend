import { AppError } from '@/shared/errors/app-error';
import { BusinessRuleError, NotFoundError } from '@/shared/errors/http-errors';

export class ListingNotFoundError extends NotFoundError {
  constructor() {
    super('Anúncio não encontrado', 'LISTING_NOT_FOUND');
  }
}

export class OwnListingError extends BusinessRuleError {
  constructor() {
    super('Este anúncio é seu.', 'OWN_LISTING');
  }
}

export class ListingUnavailableError extends BusinessRuleError {
  constructor() {
    super('Este anúncio não está mais disponível.', 'LISTING_UNAVAILABLE');
  }
}

export class SellerUnavailableError extends BusinessRuleError {
  constructor() {
    super('Não foi possível iniciar a conversa com este vendedor.', 'SELLER_UNAVAILABLE');
  }
}

export class ContactBlockedByYouError extends AppError {
  constructor() {
    super({
      statusCode: 403,
      code: 'CONTACT_BLOCKED',
      message:
        'Você bloqueou este vendedor. Para conversar de novo, desbloqueie em Configurações › Privacidade.',
    });
  }
}
