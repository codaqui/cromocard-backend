import { BusinessRuleError, NotFoundError } from '@/shared/errors/http-errors';

export class AlbumNotFoundError extends NotFoundError {
  constructor() {
    super('Álbum não encontrado', 'ALBUM_NOT_FOUND');
  }
}

export class AlbumHasCardsError extends BusinessRuleError {
  constructor() {
    super('O álbum ainda tem cartas ativas e não pode ser removido', 'ALBUM_HAS_CARDS');
  }
}
