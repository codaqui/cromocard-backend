import { BusinessRuleError, GoneError, NotFoundError } from '@/shared/errors/http-errors';

export class ReportEmptyError extends BusinessRuleError {
  constructor() {
    super('Não foram encontrados dados para os filtros selecionados', 'REPORT_EMPTY');
  }
}

export class ReportExportNotFoundError extends NotFoundError {
  constructor() {
    super('Relatório exportado não encontrado', 'REPORT_EXPORT_NOT_FOUND');
  }
}

export class ReportExportUnavailableError extends GoneError {
  constructor() {
    super(
      'O arquivo deste relatório não está mais disponível. Gere o relatório de novo.',
      'EXPORT_EXPIRED',
    );
  }
}

export class ReportExportExpiredError extends GoneError {
  constructor() {
    super(
      'O arquivo passou dos 90 dias e foi apagado. Gere o relatório de novo.',
      'EXPORT_EXPIRED',
    );
  }
}
