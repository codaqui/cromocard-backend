import { BusinessRuleError, NotFoundError } from '@/shared/errors/http-errors';

export class CategoryNotFoundError extends NotFoundError {
  constructor() {
    super('Categoria não encontrada', 'CATEGORY_NOT_FOUND');
  }
}

export class CategoryInUseError extends BusinessRuleError {
  constructor() {
    super('A categoria tem álbuns ou cartas ativos e não pode ser removida', 'CATEGORY_IN_USE');
  }
}
