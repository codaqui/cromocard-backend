import { describe, it } from 'vitest';

describe('CategoriesService', () => {
  describe('list', () => {
    it.todo('lista as categorias ordenadas por displayOrder');
    it.todo('filtra por nome e por tipo');
  });

  describe('create', () => {
    it.todo('gera o slug a partir do nome (toSlug)');
    it.todo('coloca a nova categoria no fim da ordem (maior displayOrder + 1)');
    it.todo('restaura a categoria removida quando o slug já existe com deletedAt (ADR-015)');
    it.todo('registra CATEGORY_CREATED no log de auditoria');
  });

  describe('update', () => {
    it.todo('atualiza os dados e regera o slug quando o nome muda');
    it.todo('lança CategoryNotFoundError quando a categoria não existe');
    it.todo('registra CATEGORY_UPDATED no log de auditoria');
  });

  describe('remove', () => {
    it.todo('faz soft delete da categoria sem álbuns ou cartas ativos');
    it.todo('lança CategoryInUseError quando a categoria tem itens ativos');
    it.todo('registra CATEGORY_DELETED no log de auditoria');
  });

  describe('move', () => {
    it.todo('troca a ordem com a categoria vizinha de cima (UP) ou de baixo (DOWN)');
    it.todo('não faz nada quando a categoria já está na ponta');
    it.todo('registra CATEGORY_REORDERED no log de auditoria');
  });
});
