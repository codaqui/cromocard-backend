import { describe, it } from 'vitest';

describe('AuditLogsService', () => {
  describe('record', () => {
    it.todo('grava o registro com adminId, action, entityType, entityId e details');
    it.todo('usa a transação recebida para gravar junto com a ação auditada');
  });

  describe('list', () => {
    it.todo('lista os registros paginados, dos mais recentes para os mais antigos');
    it.todo('filtra por administrador, ação, entidade e período');
    it.todo('converte o period (TODAY, LAST_7_DAYS...) no intervalo de datas');
  });

  describe('findById', () => {
    it.todo('retorna o registro com os detalhes');
    it.todo('lança AuditLogNotFoundError quando o registro não existe');
  });
});
