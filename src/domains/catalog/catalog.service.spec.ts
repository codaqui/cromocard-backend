import { beforeEach, describe, expect, it } from 'vitest';

import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';

import type { Album, AlbumsPage, AlbumsRepository } from './albums.repository';
import type {
  AlbumCardNumber,
  Card,
  CardNumberOwner,
  CardsPage,
  CardsRepository,
} from './cards.repository';
import {
  AlbumHasCardsError,
  AlbumNotFoundError,
  CardInUseError,
  CardNotFoundError,
  CardNumberTakenError,
  CategoryInUseError,
  CategoryNotFoundError,
  LanguageNotFoundError,
  RarityNotFoundError,
} from './catalog.errors';
import { CatalogService, type CardUsage } from './catalog.service';
import type {
  CreateAlbumInput,
  CreateCardInput,
  CreateCategoryInput,
  UpdateAlbumInput,
  UpdateCardInput,
  UpdateCategoryInput,
} from './catalog.validator';
import type { CategoriesPage, CategoriesRepository, Category } from './categories.repository';
import type { CatalogReference, ReferencesRepository } from './references.repository';

type Stored<T> = T & { deletedAt: Date | null };

const ADMIN_ID = crypto.randomUUID();
const FRONT_IMAGE_URL = 'http://localhost:3000/uploads/cards/frente.png';
const PAGE = { page: 1, pageSize: 20 };

function timestamps() {
  return { createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
}

function buildAlbum(input: CreateAlbumInput): Stored<Album> {
  return {
    id: crypto.randomUUID(),
    title: input.title,
    publisher: input.publisher ?? null,
    year: input.year ?? null,
    description: input.description ?? null,
    coverUrl: input.coverUrl ?? null,
    totalCards: 0,
    categoryId: input.categoryId ?? null,
    category: null,
    ...timestamps(),
  };
}

function buildCard(input: CreateCardInput): Stored<Card> {
  return {
    id: crypto.randomUUID(),
    name: input.name,
    number: input.number ?? null,
    description: input.description ?? null,
    frontImageUrl: input.frontImageUrl,
    backImageUrl: input.backImageUrl ?? null,
    albumId: input.albumId ?? null,
    categoryId: input.categoryId ?? null,
    rarityId: input.rarityId ?? null,
    languageId: input.languageId ?? null,
    album: null,
    category: null,
    rarity: null,
    language: null,
    ...timestamps(),
  };
}

function buildCategory(input: CreateCategoryInput): Stored<Category> {
  return {
    id: crypto.randomUUID(),
    name: input.name,
    type: input.type,
    parentCategoryId: input.parentCategoryId ?? null,
    parentCategory: null,
    ...timestamps(),
  };
}

function findStored<T extends { id: string }>(items: T[], id: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Item ${id} não está no repositório em memória`);
  return item;
}

class InMemoryAlbumsRepository implements AlbumsRepository {
  albums: Stored<Album>[] = [];

  findPage(): Promise<AlbumsPage> {
    const active = this.albums.filter((album) => !album.deletedAt);
    return Promise.resolve({ items: active, total: active.length });
  }

  findById(id: string): Promise<Album | null> {
    return Promise.resolve(
      this.albums.find((album) => album.id === id && !album.deletedAt) ?? null,
    );
  }

  create(input: CreateAlbumInput): Promise<Album> {
    const album = buildAlbum(input);
    this.albums.push(album);
    return Promise.resolve(album);
  }

  update(id: string, input: UpdateAlbumInput): Promise<Album> {
    return Promise.resolve(Object.assign(findStored(this.albums, id), input));
  }

  updateTotalCards(id: string, totalCards: number): Promise<void> {
    findStored(this.albums, id).totalCards = totalCards;
    return Promise.resolve();
  }

  softDelete(id: string): Promise<void> {
    findStored(this.albums, id).deletedAt = new Date();
    return Promise.resolve();
  }
}

class InMemoryCardsRepository implements CardsRepository {
  cards: Stored<Card>[] = [];

  findPage(): Promise<CardsPage> {
    const active = this.cards.filter((card) => !card.deletedAt);
    return Promise.resolve({ items: active, total: active.length });
  }

  findById(id: string): Promise<Card | null> {
    return Promise.resolve(this.cards.find((card) => card.id === id && !card.deletedAt) ?? null);
  }

  findByAlbumNumberIncludingDeleted({
    albumId,
    number,
  }: AlbumCardNumber): Promise<CardNumberOwner | null> {
    const owner = this.cards.find((card) => card.albumId === albumId && card.number === number);
    return Promise.resolve(owner ? { id: owner.id, deletedAt: owner.deletedAt } : null);
  }

  create(input: CreateCardInput): Promise<Card> {
    const card = buildCard(input);
    this.cards.push(card);
    return Promise.resolve(card);
  }

  restore(id: string, input: CreateCardInput): Promise<Card> {
    const restored = { ...buildCard(input), id };
    this.cards = this.cards.map((card) => (card.id === id ? restored : card));
    return Promise.resolve(restored);
  }

  update(id: string, input: UpdateCardInput): Promise<Card> {
    return Promise.resolve(Object.assign(findStored(this.cards, id), input));
  }

  softDelete(id: string): Promise<void> {
    findStored(this.cards, id).deletedAt = new Date();
    return Promise.resolve();
  }

  countByAlbum(albumId: string): Promise<number> {
    const count = this.cards.filter((card) => card.albumId === albumId && !card.deletedAt).length;
    return Promise.resolve(count);
  }
}

class InMemoryCategoriesRepository implements CategoriesRepository {
  categories: Stored<Category>[] = [];
  inUse = new Set<string>();

  findPage(): Promise<CategoriesPage> {
    const active = this.categories.filter((category) => !category.deletedAt);
    return Promise.resolve({ items: active, total: active.length });
  }

  findById(id: string): Promise<Category | null> {
    const category = this.categories.find((stored) => stored.id === id && !stored.deletedAt);
    return Promise.resolve(category ?? null);
  }

  create(input: CreateCategoryInput): Promise<Category> {
    const category = buildCategory(input);
    this.categories.push(category);
    return Promise.resolve(category);
  }

  update(id: string, input: UpdateCategoryInput): Promise<Category> {
    return Promise.resolve(Object.assign(findStored(this.categories, id), input));
  }

  softDelete(id: string): Promise<void> {
    findStored(this.categories, id).deletedAt = new Date();
    return Promise.resolve();
  }

  isInUse(id: string): Promise<boolean> {
    return Promise.resolve(this.inUse.has(id));
  }
}

class InMemoryReferencesRepository implements ReferencesRepository {
  rarities: CatalogReference[] = [{ id: crypto.randomUUID(), name: 'Rara' }];
  languages: CatalogReference[] = [{ id: crypto.randomUUID(), name: 'Português' }];

  listRarities(): Promise<CatalogReference[]> {
    return Promise.resolve(this.rarities);
  }

  listLanguages(): Promise<CatalogReference[]> {
    return Promise.resolve(this.languages);
  }

  rarityExists(id: string): Promise<boolean> {
    return Promise.resolve(this.rarities.some((rarity) => rarity.id === id));
  }

  languageExists(id: string): Promise<boolean> {
    return Promise.resolve(this.languages.some((language) => language.id === id));
  }
}

class InMemoryAuditLog {
  entries: RecordAuditLogInput[] = [];

  record(input: RecordAuditLogInput): Promise<void> {
    this.entries.push(input);
    return Promise.resolve();
  }

  actions() {
    return this.entries.map(({ action }) => action);
  }
}

class InMemoryCardUsage implements CardUsage {
  usedCardIds = new Set<string>();

  isCardInCollections(cardId: string): Promise<boolean> {
    return Promise.resolve(this.usedCardIds.has(cardId));
  }
}

describe('CatalogService', () => {
  let albums: InMemoryAlbumsRepository;
  let cards: InMemoryCardsRepository;
  let categories: InMemoryCategoriesRepository;
  let references: InMemoryReferencesRepository;
  let auditLog: InMemoryAuditLog;
  let cardUsage: InMemoryCardUsage;
  let service: CatalogService;

  beforeEach(() => {
    albums = new InMemoryAlbumsRepository();
    cards = new InMemoryCardsRepository();
    categories = new InMemoryCategoriesRepository();
    references = new InMemoryReferencesRepository();
    auditLog = new InMemoryAuditLog();
    cardUsage = new InMemoryCardUsage();
    service = new CatalogService({ albums, cards, categories, references, auditLog, cardUsage });
  });

  const newAlbum = () => service.createAlbum(ADMIN_ID, { title: 'Copa 2026' });
  const newCard = (input: Partial<CreateCardInput> = {}) =>
    service.createCard(ADMIN_ID, { name: 'Pikachu', frontImageUrl: FRONT_IMAGE_URL, ...input });

  describe('álbuns', () => {
    it('R3: lista os álbuns com a paginação', async () => {
      await newAlbum();

      const { items, meta } = await service.listAlbums(PAGE);

      expect(items).toHaveLength(1);
      expect(meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    it('R5, R14: cadastra e edita o álbum, gravando a auditoria', async () => {
      const album = await newAlbum();

      const updated = await service.updateAlbum(ADMIN_ID, album.id, { publisher: 'Panini' });

      expect(updated.publisher).toBe('Panini');
      expect(auditLog.entries).toEqual([
        { adminId: ADMIN_ID, action: 'ALBUM_CREATED', entityType: 'album', entityId: album.id },
        { adminId: ADMIN_ID, action: 'ALBUM_UPDATED', entityType: 'album', entityId: album.id },
      ]);
    });

    it('R5: recusa álbum com categoria inexistente', async () => {
      const input = { title: 'Copa', categoryId: crypto.randomUUID() };

      await expect(service.createAlbum(ADMIN_ID, input)).rejects.toThrow(CategoryNotFoundError);
    });

    it('R4: responde 404 para álbum inexistente', async () => {
      await expect(service.findAlbum(crypto.randomUUID())).rejects.toThrow(AlbumNotFoundError);
      await expect(
        service.updateAlbum(ADMIN_ID, crypto.randomUUID(), { title: 'Outro' }),
      ).rejects.toThrow(AlbumNotFoundError);
    });

    it('CA4: álbum com cartas não é excluído', async () => {
      const album = await newAlbum();
      await newCard({ albumId: album.id, number: '1' });

      await expect(service.deleteAlbum(ADMIN_ID, album.id)).rejects.toThrow(AlbumHasCardsError);
      await expect(service.findAlbum(album.id)).resolves.toMatchObject({ id: album.id });
    });

    it('CA4: álbum sem cartas é excluído com soft delete e auditoria', async () => {
      const album = await newAlbum();

      await service.deleteAlbum(ADMIN_ID, album.id);

      await expect(service.findAlbum(album.id)).rejects.toThrow(AlbumNotFoundError);
      expect(albums.albums[0]?.deletedAt).toBeInstanceOf(Date);
      expect(auditLog.actions()).toContain('ALBUM_DELETED');
    });
  });

  describe('cartas', () => {
    it('CA2: cadastra a carta com nome, álbum, número e imagem e atualiza o total do álbum', async () => {
      const album = await newAlbum();

      const card = await newCard({ albumId: album.id, number: '10' });

      expect(card).toMatchObject({ name: 'Pikachu', number: '10', frontImageUrl: FRONT_IMAGE_URL });
      await expect(service.listCards(PAGE)).resolves.toMatchObject({ items: [{ id: card.id }] });
      await expect(service.findAlbum(album.id)).resolves.toMatchObject({ totalCards: 1 });
      expect(auditLog.actions()).toContain('CARD_CREATED');
    });

    it('CA3: recusa outra carta com o mesmo número no mesmo álbum', async () => {
      const album = await newAlbum();
      await newCard({ albumId: album.id, number: '10' });

      await expect(newCard({ albumId: album.id, number: '10' })).rejects.toThrow(
        CardNumberTakenError,
      );
    });

    it('R7: o mesmo número em álbuns diferentes ou sem álbum é aceito', async () => {
      const [first, second] = await Promise.all([newAlbum(), newAlbum()]);
      await newCard({ albumId: first.id, number: '10' });

      await expect(newCard({ albumId: second.id, number: '10' })).resolves.toBeDefined();
      await expect(newCard({ number: '10' })).resolves.toBeDefined();
    });

    it('R7: recadastrar o número de uma carta excluída restaura a mesma linha', async () => {
      const album = await newAlbum();
      const removed = await newCard({ albumId: album.id, number: '10', name: 'Antiga' });
      await service.deleteCard(ADMIN_ID, removed.id);

      const restored = await newCard({ albumId: album.id, number: '10', name: 'Nova' });

      expect(restored).toMatchObject({ id: removed.id, name: 'Nova' });
      await expect(service.findAlbum(album.id)).resolves.toMatchObject({ totalCards: 1 });
    });

    it('R7: na edição recusa o número de outra carta, mesmo excluída', async () => {
      const album = await newAlbum();
      const card = await newCard({ albumId: album.id, number: '1' });
      const removed = await newCard({ albumId: album.id, number: '2' });
      await service.deleteCard(ADMIN_ID, removed.id);

      await expect(service.updateCard(ADMIN_ID, card.id, { number: '2' })).rejects.toThrow(
        CardNumberTakenError,
      );
    });

    it('R7: na edição aceita manter o próprio número', async () => {
      const album = await newAlbum();
      const card = await newCard({ albumId: album.id, number: '1' });

      const updated = await service.updateCard(ADMIN_ID, card.id, { number: '1', name: 'Raichu' });

      expect(updated.name).toBe('Raichu');
      expect(auditLog.actions()).toContain('CARD_UPDATED');
    });

    it('L5: mover a carta de álbum recalcula o total dos dois álbuns', async () => {
      const [from, to] = await Promise.all([newAlbum(), newAlbum()]);
      const card = await newCard({ albumId: from.id, number: '1' });

      await service.updateCard(ADMIN_ID, card.id, { albumId: to.id });

      await expect(service.findAlbum(from.id)).resolves.toMatchObject({ totalCards: 0 });
      await expect(service.findAlbum(to.id)).resolves.toMatchObject({ totalCards: 1 });
    });

    it('R6: recusa álbum, categoria, raridade ou idioma inexistentes', async () => {
      const missing = crypto.randomUUID();

      await expect(newCard({ albumId: missing })).rejects.toThrow(AlbumNotFoundError);
      await expect(newCard({ categoryId: missing })).rejects.toThrow(CategoryNotFoundError);
      await expect(newCard({ rarityId: missing })).rejects.toThrow(RarityNotFoundError);
      await expect(newCard({ languageId: missing })).rejects.toThrow(LanguageNotFoundError);
    });

    it('R6: aceita raridade e idioma do seed', async () => {
      const rarityId = references.rarities[0]?.id;
      const languageId = references.languages[0]?.id;

      await expect(newCard({ rarityId, languageId })).resolves.toMatchObject({
        rarityId,
        languageId,
      });
    });

    it('R4: responde 404 para carta inexistente', async () => {
      await expect(service.findCard(crypto.randomUUID())).rejects.toThrow(CardNotFoundError);
      await expect(service.deleteCard(ADMIN_ID, crypto.randomUUID())).rejects.toThrow(
        CardNotFoundError,
      );
    });

    it('R11: carta usada em coleções não é excluída', async () => {
      const card = await newCard();
      cardUsage.usedCardIds.add(card.id);

      await expect(service.deleteCard(ADMIN_ID, card.id)).rejects.toThrow(CardInUseError);
    });

    it('R10, R14: exclui a carta com soft delete, recalcula o total e audita', async () => {
      const album = await newAlbum();
      const card = await newCard({ albumId: album.id, number: '1' });

      await service.deleteCard(ADMIN_ID, card.id);

      await expect(service.findCard(card.id)).rejects.toThrow(CardNotFoundError);
      await expect(service.findAlbum(album.id)).resolves.toMatchObject({ totalCards: 0 });
      expect(auditLog.actions()).toContain('CARD_DELETED');
    });

    it('R11: sem a checagem de coleções ligada, a carta é excluída', async () => {
      const withoutUsage = new CatalogService({ albums, cards, categories, references, auditLog });
      const card = await newCard();

      await withoutUsage.deleteCard(ADMIN_ID, card.id);

      await expect(service.findCard(card.id)).rejects.toThrow(CardNotFoundError);
    });
  });

  describe('categorias', () => {
    const newCategory = (input: Partial<CreateCategoryInput> = {}) =>
      service.createCategory(ADMIN_ID, { name: 'Futebol', type: 'ALBUM', ...input });

    it('R15: cadastra, edita e lista categorias com auditoria', async () => {
      const category = await newCategory();

      await service.updateCategory(ADMIN_ID, category.id, { name: 'Esportes' });

      await expect(service.listCategories(PAGE)).resolves.toMatchObject({
        items: [{ name: 'Esportes' }],
      });
      expect(auditLog.actions()).toEqual(['CATEGORY_CREATED', 'CATEGORY_UPDATED']);
    });

    it('R15: recusa categoria pai inexistente', async () => {
      await expect(newCategory({ parentCategoryId: crypto.randomUUID() })).rejects.toThrow(
        CategoryNotFoundError,
      );
    });

    it('R4: responde 404 para categoria inexistente', async () => {
      await expect(service.findCategory(crypto.randomUUID())).rejects.toThrow(
        CategoryNotFoundError,
      );
    });

    it('R11: categoria com álbuns, cartas ou subcategorias não é excluída', async () => {
      const category = await newCategory();
      categories.inUse.add(category.id);

      await expect(service.deleteCategory(ADMIN_ID, category.id)).rejects.toThrow(
        CategoryInUseError,
      );
    });

    it('R10, R14: categoria livre é excluída com soft delete e auditoria', async () => {
      const category = await newCategory();

      await service.deleteCategory(ADMIN_ID, category.id);

      await expect(service.findCategory(category.id)).rejects.toThrow(CategoryNotFoundError);
      expect(auditLog.actions()).toContain('CATEGORY_DELETED');
    });
  });

  describe('raridades e idiomas', () => {
    it('R15: lista as raridades e os idiomas do seed', async () => {
      await expect(service.listRarities()).resolves.toEqual(references.rarities);
      await expect(service.listLanguages()).resolves.toEqual(references.languages);
    });
  });
});
