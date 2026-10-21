import { describe, it } from 'vitest';

describe('CardsService', () => {
  describe('list', () => {
    it.todo('busca por nome ou número e filtra por álbum, categoria, raridade e idioma');
  });

  describe('create', () => {
    it.todo('cria a carta com nome, número, álbum, categoria, raridade e idioma (RN01)');
    it.todo('lança CardNumberTakenError quando o número já existe no mesmo álbum (RN03)');
    it.todo('lança InvalidCardReferenceError quando o álbum não existe');
    it.todo('registra CARD_CREATED no log de auditoria');
  });

  describe('update', () => {
    it.todo('atualiza os dados e revalida o número no álbum ignorando a própria carta');
    it.todo('lança CardNotFoundError quando a carta não existe');
    it.todo('registra CARD_UPDATED no log de auditoria');
  });

  describe('remove', () => {
    it.todo('faz soft delete da carta (RN05)');
    it.todo('registra CARD_DELETED no log de auditoria');
  });
});
