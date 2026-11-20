import { NotFoundError } from '@/shared/errors/http-errors';

export class SettingNotFoundError extends NotFoundError {
  constructor() {
    super('Configuração não encontrada', 'SETTING_NOT_FOUND');
  }
}
