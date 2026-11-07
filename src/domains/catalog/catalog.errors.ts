import { AppError, type ErrorDetail } from '@/shared/errors/app-error';
import { BusinessRuleError, ConflictError, NotFoundError } from '@/shared/errors/http-errors';

export class AlbumNotFoundError extends NotFoundError {
  constructor() {
    super('Álbum não encontrado', 'ALBUM_NOT_FOUND');
  }
}

export class CardNotFoundError extends NotFoundError {
  constructor() {
    super('Carta não encontrada', 'CARD_NOT_FOUND');
  }
}

export class CategoryNotFoundError extends NotFoundError {
  constructor() {
    super('Categoria não encontrada', 'CATEGORY_NOT_FOUND');
  }
}

export class RarityNotFoundError extends NotFoundError {
  constructor() {
    super('Raridade não encontrada', 'RARITY_NOT_FOUND');
  }
}

export class LanguageNotFoundError extends NotFoundError {
  constructor() {
    super('Idioma não encontrado', 'LANGUAGE_NOT_FOUND');
  }
}

export class CardNumberTakenError extends ConflictError {
  constructor() {
    super('Já existe uma carta com este número no álbum', 'CARD_NUMBER_TAKEN');
  }
}

export class AlbumHasCardsError extends BusinessRuleError {
  constructor() {
    super('O álbum tem cartas cadastradas e não pode ser excluído', 'ALBUM_HAS_CARDS');
  }
}

export class CardInUseError extends BusinessRuleError {
  constructor() {
    super('A carta já está em coleções e não pode ser excluída', 'CARD_IN_USE');
  }
}

export class CategoryInUseError extends BusinessRuleError {
  constructor() {
    super(
      'A categoria tem álbuns, cartas ou subcategorias e não pode ser excluída',
      'CATEGORY_IN_USE',
    );
  }
}

export class CategoryParentInvalidError extends BusinessRuleError {
  constructor() {
    super(
      'A categoria não pode ficar dentro dela mesma nem de uma subcategoria dela',
      'CATEGORY_PARENT_INVALID',
    );
  }
}

export class CsvInvalidError extends AppError {
  constructor(details: ErrorDetail[]) {
    super({
      statusCode: 422,
      code: 'CSV_INVALID',
      message: 'O arquivo tem linhas com erro e nenhuma carta foi importada',
      details,
    });
  }
}
