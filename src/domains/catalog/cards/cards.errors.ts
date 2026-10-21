import { BusinessRuleError, ConflictError, NotFoundError } from '@/shared/errors/http-errors';

export class CardNotFoundError extends NotFoundError {
  constructor() {
    super('Carta não encontrada', 'CARD_NOT_FOUND');
  }
}

export class CardNumberTakenError extends ConflictError {
  constructor() {
    super('Já existe uma carta com este número no álbum', 'CARD_NUMBER_TAKEN');
  }
}

export class InvalidCardReferenceError extends BusinessRuleError {
  constructor(field: 'albumId' | 'categoryId' | 'rarityId' | 'languageId') {
    super(`O valor informado em ${field} não existe`, 'INVALID_CARD_REFERENCE');
  }
}
