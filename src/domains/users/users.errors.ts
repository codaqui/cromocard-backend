import { NotFoundError } from '@/shared/errors/http-errors';

export class UserNotFoundError extends NotFoundError {
  constructor() {
    super('Usuário não encontrado', 'USER_NOT_FOUND');
  }
}
