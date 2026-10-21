import { describe, it } from 'vitest';

describe('AlbumsService', () => {
  describe('list', () => {
    it.todo('lista os álbuns paginados, filtrando por título, categoria e status');
  });

  describe('create', () => {
    it.todo('cria o álbum com título, categoria e ano (RN02)');
    it.todo('registra ALBUM_CREATED no log de auditoria');
  });

  describe('update', () => {
    it.todo('atualiza os dados do álbum');
    it.todo('lança AlbumNotFoundError quando o álbum não existe');
    it.todo('registra ALBUM_UPDATED no log de auditoria');
  });

  describe('remove', () => {
    it.todo('faz soft delete do álbum sem cartas ativas');
    it.todo('lança AlbumHasCardsError quando o álbum tem cartas ativas (RN04)');
    it.todo('registra ALBUM_DELETED no log de auditoria');
  });
});
