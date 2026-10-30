import { describe, expect, it } from 'vitest';

import {
  catalogItemIdParamSchema,
  createAlbumSchema,
  createCardSchema,
  createCategorySchema,
  updateAlbumSchema,
  updateCardSchema,
} from './catalog.validator';

const validCard = {
  name: 'Pikachu',
  frontImageUrl: 'http://localhost:3000/uploads/cards/a.png',
};

describe('createAlbumSchema', () => {
  it('R5: aceita álbum só com o título', () => {
    expect(createAlbumSchema.safeParse({ title: 'Copa 2026' }).success).toBe(true);
  });

  it('R5: recusa álbum sem título ou com título em branco', () => {
    expect(createAlbumSchema.safeParse({}).success).toBe(false);
    expect(createAlbumSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('R5: recusa título acima de 160 caracteres e editora acima de 120', () => {
    expect(createAlbumSchema.safeParse({ title: 'a'.repeat(161) }).success).toBe(false);
    expect(createAlbumSchema.safeParse({ title: 'Copa', publisher: 'a'.repeat(121) }).success).toBe(
      false,
    );
  });

  it('R5: recusa ano que não é inteiro, capa que não é URL e categoria que não é UUID', () => {
    expect(createAlbumSchema.safeParse({ title: 'Copa', year: 2026.5 }).success).toBe(false);
    expect(createAlbumSchema.safeParse({ title: 'Copa', coverUrl: 'capa.png' }).success).toBe(
      false,
    );
    expect(createAlbumSchema.safeParse({ title: 'Copa', categoryId: '123' }).success).toBe(false);
  });

  it('R5: na edição aceita só os campos alterados e limpa um opcional com null', () => {
    expect(updateAlbumSchema.safeParse({ publisher: null }).success).toBe(true);
  });
});

describe('createCardSchema', () => {
  it('R6: aceita carta com nome e imagem da frente', () => {
    expect(createCardSchema.safeParse(validCard).success).toBe(true);
  });

  it('R6: recusa carta sem nome ou com nome acima de 160 caracteres', () => {
    expect(createCardSchema.safeParse({ ...validCard, name: '' }).success).toBe(false);
    expect(createCardSchema.safeParse({ ...validCard, name: 'a'.repeat(161) }).success).toBe(false);
  });

  it('R6: recusa carta sem a imagem da frente', () => {
    expect(createCardSchema.safeParse({ name: 'Pikachu' }).success).toBe(false);
  });

  it('R6: recusa número acima de 20 caracteres e referências que não são UUID', () => {
    expect(createCardSchema.safeParse({ ...validCard, number: 'a'.repeat(21) }).success).toBe(
      false,
    );
    expect(createCardSchema.safeParse({ ...validCard, albumId: 'x' }).success).toBe(false);
    expect(createCardSchema.safeParse({ ...validCard, rarityId: 'x' }).success).toBe(false);
  });

  it('R6: na edição não deixa apagar a imagem da frente', () => {
    expect(updateCardSchema.safeParse({ frontImageUrl: null }).success).toBe(false);
    expect(updateCardSchema.safeParse({ backImageUrl: null }).success).toBe(true);
  });
});

describe('createCategorySchema', () => {
  it('R15: aceita categoria com nome e tipo', () => {
    expect(createCategorySchema.safeParse({ name: 'Futebol', type: 'ALBUM' }).success).toBe(true);
  });

  it('R15: recusa tipo fora do enum e nome acima de 90 caracteres', () => {
    expect(createCategorySchema.safeParse({ name: 'Futebol', type: 'GAME' }).success).toBe(false);
    expect(createCategorySchema.safeParse({ name: 'a'.repeat(91), type: 'CARD' }).success).toBe(
      false,
    );
  });
});

describe('catalogItemIdParamSchema', () => {
  it('R8: recusa id que não é UUID', () => {
    expect(catalogItemIdParamSchema.safeParse({ id: '1' }).success).toBe(false);
  });
});
