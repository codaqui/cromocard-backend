import { BusinessRuleError } from '@/shared/errors/http-errors';

export class ReportEmptyError extends BusinessRuleError {
  constructor() {
    super('Não foram encontrados dados para os filtros selecionados', 'REPORT_EMPTY');
  }
}
