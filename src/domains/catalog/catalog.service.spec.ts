import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import { Prisma } from '@/generated/prisma/client';
import { slugify } from '@/lib/slug';

import type { Album, AlbumsPage, AlbumsRepository } from './catalog-albums.repository';
import type {
  AlbumCardNumber,
  Card,
  CardCodeOwner,
  CardIdentity,
  CardNumberOwner,
  CardsPage,
  CardsRepository,
} from './catalog-cards.repository';
import {
  AlbumHasCardsError,
  AlbumNotFoundError,
  CardCodeTakenError,
  CardInUseError,
  CardNotFoundError,
  CardNumberOfDeletedCardError,
  CardNumberTakenError,
  CategoryInUseError,
  CategoryNotFoundError,
  CategoryParentInvalidError,
  CategoryTypeMismatchError,
  LanguageNotFoundError,
  RarityNotFoundError,
  SlugTakenError,
} from './catalog.errors';
import { CardsBulkDeleteService } from './catalog-bulk-delete.service';
import type { CatalogSummary, CatalogSummaryRepository } from './catalog-summary.repository';
import { CatalogService, type CardUsage } from './catalog.service';
import type {
  CreateAlbumInput,
  CreateCardInput,
  CreateCategoryInput,
  UpdateAlbumInput,
  UpdateCardInput,
} from './catalog.validator';
import type {
  CategoriesPage,
  CategoriesRepository,
  Category,
  CreateCategoryRecord,
  UpdateCategoryRecord,
} from './catalog-categories.repository';
import type { CategoryCardCounts } from './catalog-category-counts.repository';
import type { CatalogReference, ReferencesRepository } from './catalog-references.repository';

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
    status: input.status ?? 'ACTIVE',
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
    code: input.code ?? null,
    variants: input.variants ?? null,
    description: input.description ?? null,
    frontImageUrl: input.frontImageUrl,
    backImageUrl: input.backImageUrl ?? null,
    albumId: input.albumId ?? null,
    categoryId: input.categoryId,
    rarityId: input.rarityId,
    languageId: input.languageId,
    album: null,
    category: null,
    rarity: null,
    language: null,
    ...timestamps(),
  };
}

function buildCategory(input: CreateCategoryInput & { slug?: string }): Stored<Category> {
  return {
    id: crypto.randomUUID(),
    name: input.name,
    type: input.type,
    slug: input.slug ?? slugify(input.name),
    badge: input.badge ?? null,
    description: input.description ?? null,
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

  findActiveByCode(code: string): Promise<CardCodeOwner | null> {
    const owner = this.cards.find((card) => card.code === code && !card.deletedAt);
    return Promise.resolve(owner ? { id: owner.id, name: owner.name } : null);
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

  findActiveIdentities(ids: string[]): Promise<CardIdentity[]> {
    const found = this.cards.filter((card) => ids.includes(card.id) && !card.deletedAt);
    return Promise.resolve(found.map(({ id, name, number }) => ({ id, name, number })));
  }

  softDeleteMany(ids: string[]): Promise<void> {
    this.cards
      .filter((card) => ids.includes(card.id) && !card.deletedAt)
      .forEach((card) => (card.deletedAt = new Date()));
    return Promise.resolve();
  }

  countByAlbum(albumId: string): Promise<number> {
    const count = this.cards.filter((card) => card.albumId === albumId && !card.deletedAt).length;
    return Promise.resolve(count);
  }

  count(): Promise<number> {
    return Promise.resolve(this.cards.filter((card) => !card.deletedAt).length);
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

  findActiveBySlug(slug: string, exceptId?: string): Promise<Category | null> {
    const category = this.categories.find(
      (stored) => stored.slug === slug && stored.id !== exceptId && !stored.deletedAt,
    );
    return Promise.resolve(category ?? null);
  }

  create(input: CreateCategoryRecord): Promise<Category> {
    const category = buildCategory(input);
    this.categories.push(category);
    return Promise.resolve(category);
  }

  update(id: string, input: UpdateCategoryRecord): Promise<Category> {
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

class InMemoryCardCounts implements CategoryCardCounts {
  totals = new Map<string, number>();

  countByCategory(ids: string[]): Promise<Map<string, number>> {
    return Promise.resolve(new Map(ids.map((id) => [id, this.totals.get(id) ?? 0])));
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

class FixedCatalogSummary implements CatalogSummaryRepository {
  constructor(private readonly summary: CatalogSummary) {}

  summarize(): Promise<CatalogSummary> {
    return Promise.resolve(this.summary);
  }
}

const SUMMARY: CatalogSummary = { albums: 142, licensedAlbums: 128, pendingAlbumRequests: 14 };

describe('CatalogService', () => {
  let albums: InMemoryAlbumsRepository;
  let cards: InMemoryCardsRepository;
  let categories: InMemoryCategoriesRepository;
  let references: InMemoryReferencesRepository;
  let auditLog: InMemoryAuditLog;
  let cardUsage: InMemoryCardUsage;
  let cardCounts: InMemoryCardCounts;
  let service: CatalogService;
  let bulkDelete: CardsBulkDeleteService;
  let franchise: Stored<Category>;

  beforeEach(() => {
    albums = new InMemoryAlbumsRepository();
    cards = new InMemoryCardsRepository();
    categories = new InMemoryCategoriesRepository();
    references = new InMemoryReferencesRepository();
    auditLog = new InMemoryAuditLog();
    cardUsage = new InMemoryCardUsage();
    cardCounts = new InMemoryCardCounts();
    service = new CatalogService({
      albums,
      cards,
      categories,
      cardCounts,
      references,
      auditLog,
      summary: new FixedCatalogSummary(SUMMARY),
      cardUsage,
    });
    bulkDelete = new CardsBulkDeleteService({ cards, auditLog, cardUsage });
    franchise = buildCategory({ name: 'Pokémon', type: 'CARD' });
  });

  const newAlbum = () => service.createAlbum(ADMIN_ID, { title: 'Copa 2026' });
  const categoryOfType = (type: CreateCategoryInput['type']) =>
    service.createCategory(ADMIN_ID, { name: `Categoria ${type}`, type });
  /** Grava a franquia só quando um teste de carta precisa dela, para não aparecer nas listas de categorias. */
  const franchiseId = () => {
    if (!categories.categories.includes(franchise)) categories.categories.push(franchise);
    return franchise.id;
  };
  const publishableCard = (): CreateCardInput => ({
    name: 'Pikachu',
    frontImageUrl: FRONT_IMAGE_URL,
    categoryId: franchiseId(),
    rarityId: references.rarities[0]?.id ?? '',
    languageId: references.languages[0]?.id ?? '',
  });
  const newCard = (input: Partial<CreateCardInput> = {}) =>
    service.createCard(ADMIN_ID, { ...publishableCard(), ...input });

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

    it('L9: álbum só aceita categoria de álbum', async () => {
      const cardCategory = await categoryOfType('CARD');
      const albumCategory = await categoryOfType('ALBUM');
      const album = await newAlbum();

      await expect(
        service.createAlbum(ADMIN_ID, { title: 'Copa', categoryId: cardCategory.id }),
      ).rejects.toThrow(CategoryTypeMismatchError);
      await expect(
        service.updateAlbum(ADMIN_ID, album.id, { categoryId: albumCategory.id }),
      ).resolves.toMatchObject({ categoryId: albumCategory.id });
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
    it('CA2: cadastra a carta com nome, álbum, número e imagem', async () => {
      const album = await newAlbum();

      const card = await newCard({ albumId: album.id, number: '10' });

      expect(card).toMatchObject({ name: 'Pikachu', number: '10', frontImageUrl: FRONT_IMAGE_URL });
      await expect(service.listCards(PAGE)).resolves.toMatchObject({ items: [{ id: card.id }] });
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
    });

    it('R7: na edição recusa o número de outra carta ativa', async () => {
      const album = await newAlbum();
      const card = await newCard({ albumId: album.id, number: '1' });
      await newCard({ albumId: album.id, number: '2' });

      await expect(service.updateCard(ADMIN_ID, card.id, { number: '2' })).rejects.toThrow(
        CardNumberTakenError,
      );
    });

    it('R7: na edição recusa o número de uma carta excluída e diz que ela foi excluída', async () => {
      const album = await newAlbum();
      const card = await newCard({ albumId: album.id, number: '1' });
      const removed = await newCard({ albumId: album.id, number: '2' });
      await service.deleteCard(ADMIN_ID, removed.id);

      const error = await service
        .updateCard(ADMIN_ID, card.id, { number: '2' })
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(CardNumberOfDeletedCardError);
      expect(error).toMatchObject({
        code: 'CARD_NUMBER_TAKEN',
        message: 'O número pertence a uma carta excluída deste álbum',
      });
    });

    it('R7: na edição aceita manter o próprio número', async () => {
      const album = await newAlbum();
      const card = await newCard({ albumId: album.id, number: '1' });

      const updated = await service.updateCard(ADMIN_ID, card.id, { number: '1', name: 'Raichu' });

      expect(updated.name).toBe('Raichu');
      expect(auditLog.actions()).toContain('CARD_UPDATED');
    });

    it('R7: cadastro simultâneo barrado pelo índice único responde CARD_NUMBER_TAKEN', async () => {
      const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'teste',
      });
      vi.spyOn(cards, 'create').mockRejectedValueOnce(duplicate);

      await expect(newCard({ number: '1' })).rejects.toThrow(CardNumberTakenError);
    });

    it('CA2: cadastra a carta duplicada com código e variantes', async () => {
      const album = await newAlbum();
      const source = await newCard({ albumId: album.id, number: '4', code: 'CRD-POK-0004' });

      const copy = await newCard({
        albumId: source.albumId,
        number: '5',
        code: 'CRD-POK-0005',
        variants: 'Shadowless, Holofoil',
      });

      expect(copy).toMatchObject({ code: 'CRD-POK-0005', variants: 'Shadowless, Holofoil' });
      expect(auditLog.entries.at(-1)).toMatchObject({ action: 'CARD_CREATED', entityId: copy.id });
    });

    it('CA5: recusa outro cadastro com um código em uso e diz de qual carta ele é', async () => {
      await newCard({ name: 'Charizard', code: 'CRD-POK-0004' });

      const error = await newCard({ code: 'CRD-POK-0004' }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(CardCodeTakenError);
      expect(error).toMatchObject({
        code: 'CARD_CODE_TAKEN',
        details: [{ field: 'code', message: 'Este código já está em uso por Charizard.' }],
      });
      expect(cards.cards).toHaveLength(1);
    });

    it('CA5: na edição recusa o código de outra carta e aceita manter o próprio', async () => {
      const card = await newCard({ code: 'CRD-POK-0001' });
      await newCard({ name: 'Blastoise', code: 'CRD-POK-0002' });

      await expect(
        service.updateCard(ADMIN_ID, card.id, { code: 'CRD-POK-0002' }),
      ).rejects.toMatchObject({
        details: [{ field: 'code', message: 'Este código já está em uso por Blastoise.' }],
      });
      await expect(
        service.updateCard(ADMIN_ID, card.id, { code: 'CRD-POK-0001', name: 'Raichu' }),
      ).resolves.toMatchObject({ code: 'CRD-POK-0001', name: 'Raichu' });
    });

    it('L7: o código de uma carta excluída pode ser usado de novo', async () => {
      const removed = await newCard({ name: 'Antiga', code: 'CRD-POK-0009' });
      await service.deleteCard(ADMIN_ID, removed.id);

      const card = await newCard({ name: 'Nova', code: 'CRD-POK-0009' });

      expect(card).toMatchObject({ name: 'Nova', code: 'CRD-POK-0009' });
      expect(card.id).not.toBe(removed.id);
    });

    it('CA5: cadastro simultâneo barrado pelo índice do código responde CARD_CODE_TAKEN', async () => {
      const duplicate = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'teste',
        meta: { target: ['code'] },
      });
      vi.spyOn(cards, 'create').mockRejectedValueOnce(duplicate);

      await expect(newCard({ code: 'CRD-POK-0001' })).rejects.toMatchObject({
        code: 'CARD_CODE_TAKEN',
        details: [{ field: 'code', message: 'Este código já está em uso por outra carta.' }],
      });
    });

    it('R7: erro do banco que não é de valor único continua subindo', async () => {
      vi.spyOn(cards, 'create').mockRejectedValueOnce(new Error('banco fora do ar'));

      await expect(newCard()).rejects.toThrow('banco fora do ar');
    });

    it('R6: recusa álbum, categoria, raridade ou idioma inexistentes', async () => {
      const missing = crypto.randomUUID();

      await expect(newCard({ albumId: missing })).rejects.toThrow(AlbumNotFoundError);
      await expect(newCard({ categoryId: missing })).rejects.toThrow(CategoryNotFoundError);
      await expect(newCard({ rarityId: missing })).rejects.toThrow(RarityNotFoundError);
      await expect(newCard({ languageId: missing })).rejects.toThrow(LanguageNotFoundError);
    });

    it('L9: carta só aceita categoria de carta', async () => {
      const albumCategory = await categoryOfType('ALBUM');
      const cardCategory = await categoryOfType('CARD');

      await expect(newCard({ categoryId: albumCategory.id })).rejects.toThrow(
        CategoryTypeMismatchError,
      );
      await expect(newCard({ categoryId: cardCategory.id })).resolves.toMatchObject({
        categoryId: cardCategory.id,
      });
    });

    it('conta as cartas ativas do catálogo para o dashboard', async () => {
      await newCard();
      const deleted = await newCard({ name: 'Excluída' });
      await service.deleteCard(ADMIN_ID, deleted.id);

      await expect(service.countCards()).resolves.toBe(1);
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

    it('R10, R14: exclui a carta com soft delete e audita', async () => {
      const album = await newAlbum();
      const card = await newCard({ albumId: album.id, number: '1' });

      await service.deleteCard(ADMIN_ID, card.id);

      await expect(service.findCard(card.id)).rejects.toThrow(CardNotFoundError);
      expect(auditLog.actions()).toContain('CARD_DELETED');
    });

    it('R11: sem a checagem de coleções ligada, a carta é excluída', async () => {
      const withoutUsage = new CatalogService({
        albums,
        cards,
        categories,
        cardCounts,
        references,
        auditLog,
        summary: new FixedCatalogSummary(SUMMARY),
      });
      const card = await newCard();

      await withoutUsage.deleteCard(ADMIN_ID, card.id);

      await expect(service.findCard(card.id)).rejects.toThrow(CardNotFoundError);
    });
  });

  describe('resumo do catálogo', () => {
    it('CA4: devolve o total de álbuns, os licenciados e as solicitações pendentes', async () => {
      await expect(service.getSummary()).resolves.toEqual(SUMMARY);
    });
  });

  describe('exclusão em lote', () => {
    const REASON = 'Rascunhos criados em duplicidade na importação';
    const fiveCards = () =>
      Promise.all(['1', '2', '3', '4', '5'].map((number) => newCard({ name: `Carta ${number}` })));

    it('CA7: exclui as cinco cartas e registra cada uma no log com o motivo', async () => {
      const selected = await fiveCards();
      const ids = selected.map(({ id }) => id);

      const result = await bulkDelete.deleteCards(ADMIN_ID, { ids, reason: REASON });

      expect(result).toEqual({ deleted: ids, skipped: [] });
      await expect(service.listCards(PAGE)).resolves.toMatchObject({ items: [] });
      const deletedEntries = auditLog.entries.filter(({ action }) => action === 'CARD_DELETED');
      expect(deletedEntries.map(({ entityId, reason }) => ({ entityId, reason }))).toEqual(
        ids.map((entityId) => ({ entityId, reason: REASON })),
      );
    });

    it('CA9: mantém as cartas usadas em coleções e diz quais ficaram', async () => {
      const selected = await fiveCards();
      const [first, second] = selected;
      cardUsage.usedCardIds.add(first!.id).add(second!.id);

      const result = await bulkDelete.deleteCards(ADMIN_ID, {
        ids: selected.map(({ id }) => id),
        reason: REASON,
      });

      expect(result.skipped).toEqual([
        { id: first!.id, name: 'Carta 1', number: null },
        { id: second!.id, name: 'Carta 2', number: null },
      ]);
      expect(result.deleted).toEqual(selected.slice(2).map(({ id }) => id));
      const { items } = await service.listCards(PAGE);
      expect(items.map(({ id }) => id)).toEqual([first!.id, second!.id]);
      const deletedEntries = auditLog.entries.filter(({ action }) => action === 'CARD_DELETED');
      expect(deletedEntries.map(({ entityId }) => entityId)).toEqual(result.deleted);
    });

    it('CA9: com todas as cartas em coleções, nada é excluído nem auditado', async () => {
      const card = await newCard();
      cardUsage.usedCardIds.add(card.id);

      const result = await bulkDelete.deleteCards(ADMIN_ID, { ids: [card.id], reason: REASON });

      expect(result).toEqual({
        deleted: [],
        skipped: [{ id: card.id, name: 'Pikachu', number: null }],
      });
      expect(auditLog.actions()).not.toContain('CARD_DELETED');
    });

    it('R10: ignora cartas inexistentes ou já excluídas', async () => {
      const removed = await newCard();
      await service.deleteCard(ADMIN_ID, removed.id);
      const entriesBefore = auditLog.entries.length;

      const result = await bulkDelete.deleteCards(ADMIN_ID, {
        ids: [removed.id, crypto.randomUUID()],
        reason: REASON,
      });

      expect(result).toEqual({ deleted: [], skipped: [] });
      expect(auditLog.entries).toHaveLength(entriesBefore);
    });

    it('R10: sem a checagem de coleções ligada, exclui todas as selecionadas', async () => {
      const withoutUsage = new CardsBulkDeleteService({ cards, auditLog });
      const card = await newCard();

      const result = await withoutUsage.deleteCards(ADMIN_ID, { ids: [card.id], reason: REASON });

      expect(result.deleted).toEqual([card.id]);
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

    it('CA1: lista as categorias com a quantidade de cartas de cada uma', async () => {
      const football = await newCategory();
      const empty = await newCategory({ name: 'Magic', type: 'CARD' });
      cardCounts.totals.set(football.id, 7300);

      const page = await service.listCategories(PAGE);

      expect(page.items.map(({ id, cardsCount }) => [id, cardsCount])).toEqual([
        [football.id, 7300],
        [empty.id, 0],
      ]);
    });

    it('CA1: devolve a quantidade de cartas ao buscar, cadastrar e editar a categoria', async () => {
      const created = await newCategory();
      cardCounts.totals.set(created.id, 12);

      const found = await service.findCategory(created.id);
      const edited = await service.updateCategory(ADMIN_ID, created.id, { description: 'Álbuns' });

      expect([created.cardsCount, found.cardsCount, edited.cardsCount]).toEqual([0, 12, 12]);
    });

    it('CA6: gera o slug one-piece ao cadastrar "One Piece"', async () => {
      const category = await newCategory({ name: 'One Piece', type: 'CARD' });

      expect(category.slug).toBe('one-piece');
    });

    it('R10: grava o selo escolhido e começa sem selo', async () => {
      const trending = await newCategory({ name: 'Pokémon', badge: 'TRENDING' });
      const plain = await newCategory({ name: 'Magic' });

      expect([trending.badge, plain.badge]).toEqual(['TRENDING', null]);
    });

    it('CA12: refaz o slug quando o nome muda', async () => {
      const category = await newCategory({ name: 'Yu-Gi-Oh!', type: 'CARD' });
      const before = category.slug;

      const renamed = await service.updateCategory(ADMIN_ID, category.id, {
        name: 'Yu-Gi-Oh! TCG',
      });

      expect([before, renamed.slug]).toEqual(['yu-gi-oh', 'yu-gi-oh-tcg']);
    });

    it('CA12: mantém o slug quando a edição não muda o nome', async () => {
      const category = await newCategory({ name: 'Yu-Gi-Oh!', type: 'CARD' });

      const edited = await service.updateCategory(ADMIN_ID, category.id, { description: 'Cartas' });

      expect(edited.slug).toBe('yu-gi-oh');
    });

    it('R9: editar só o selo muda o selo e não refaz o slug', async () => {
      const category = await newCategory({ name: 'Yu-Gi-Oh!', type: 'CARD' });
      const findBySlug = vi.spyOn(categories, 'findActiveBySlug');

      const edited = await service.updateCategory(ADMIN_ID, category.id, { badge: 'TRENDING' });

      expect([edited.slug, edited.badge]).toEqual(['yu-gi-oh', 'TRENDING']);
      expect(findBySlug).not.toHaveBeenCalled();
    });

    it('CA12: renomear só a pontuação não conflita com o próprio slug', async () => {
      const category = await newCategory({ name: 'Yu-Gi-Oh!', type: 'CARD' });

      const renamed = await service.updateCategory(ADMIN_ID, category.id, { name: 'Yu Gi Oh' });

      expect(renamed.slug).toBe('yu-gi-oh');
    });

    it('CA13: recusa com SLUG_TAKEN o nome que gera o slug de uma categoria ativa', async () => {
      await newCategory({ name: 'Pokémon', type: 'CARD' });

      const error = await newCategory({ name: 'Pokemon', type: 'CARD' }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SlugTakenError);
      expect(error).toMatchObject({ statusCode: 409, code: 'SLUG_TAKEN' });
      expect((error as SlugTakenError).details).toEqual([
        expect.objectContaining({ field: 'name' }),
      ]);
    });

    it('CA13: recusa renomear para o slug de outra categoria ativa', async () => {
      await newCategory({ name: 'Pokémon', type: 'CARD' });
      const other = await newCategory({ name: 'Magic', type: 'CARD' });

      await expect(service.updateCategory(ADMIN_ID, other.id, { name: 'Pokemon' })).rejects.toThrow(
        SlugTakenError,
      );
    });

    it('CA13: cria "One Piece" com uma excluída de mesmo slug, sem restaurá-la', async () => {
      const deleted = await newCategory({ name: 'One Piece', type: 'CARD' });
      await service.deleteCategory(ADMIN_ID, deleted.id);

      const created = await newCategory({ name: 'One Piece', type: 'CARD' });

      expect(created.id).not.toBe(deleted.id);
      await expect(service.findCategory(deleted.id)).rejects.toThrow(CategoryNotFoundError);
    });

    it('um erro que não é de slug repetido sobe como veio', async () => {
      const failure = new Error('banco fora do ar');
      vi.spyOn(categories, 'create').mockRejectedValueOnce(failure);

      await expect(newCategory({ name: 'Pokémon', type: 'CARD' })).rejects.toBe(failure);
    });

    it('CA13: traduz a violação do índice único, quando duas criações disputam o slug', async () => {
      const raced = new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'x',
      });
      vi.spyOn(categories, 'create').mockRejectedValueOnce(raced);

      await expect(newCategory({ name: 'Pokémon', type: 'CARD' })).rejects.toThrow(SlugTakenError);
    });

    it('R15: recusa a categoria como pai dela mesma', async () => {
      const category = await newCategory();

      await expect(
        service.updateCategory(ADMIN_ID, category.id, { parentCategoryId: category.id }),
      ).rejects.toThrow(CategoryParentInvalidError);
    });

    it('R15: recusa uma subcategoria, direta ou não, como pai', async () => {
      const root = await newCategory({ name: 'Esportes' });
      const child = await newCategory({ name: 'Futebol', parentCategoryId: root.id });
      const grandchild = await newCategory({ name: 'Copa', parentCategoryId: child.id });

      await expect(
        service.updateCategory(ADMIN_ID, root.id, { parentCategoryId: grandchild.id }),
      ).rejects.toThrow(CategoryParentInvalidError);
    });

    it('R15: aceita mover a categoria para outro ramo', async () => {
      const sports = await newCategory({ name: 'Esportes' });
      const games = await newCategory({ name: 'Jogos' });
      const child = await newCategory({ name: 'Futebol', parentCategoryId: sports.id });

      const moved = await service.updateCategory(ADMIN_ID, child.id, {
        parentCategoryId: games.id,
      });

      expect(moved.parentCategoryId).toBe(games.id);
    });

    it('L7, L9: a categoria pai precisa ser do mesmo tipo', async () => {
      const albumRoot = await newCategory({ name: 'Esportes' });
      const cardRoot = await newCategory({ name: 'Jogadores', type: 'CARD' });

      await expect(
        newCategory({ name: 'Atacantes', type: 'CARD', parentCategoryId: albumRoot.id }),
      ).rejects.toThrow(CategoryTypeMismatchError);
      await expect(
        service.updateCategory(ADMIN_ID, cardRoot.id, { parentCategoryId: albumRoot.id }),
      ).rejects.toThrow(CategoryTypeMismatchError);
    });

    it('L9: trocar o tipo confere a categoria pai e o uso da categoria', async () => {
      const root = await newCategory({ name: 'Esportes' });
      const child = await newCategory({ name: 'Futebol', parentCategoryId: root.id });
      const free = await newCategory({ name: 'Livre' });
      categories.inUse.add(root.id);

      await expect(service.updateCategory(ADMIN_ID, child.id, { type: 'CARD' })).rejects.toThrow(
        CategoryTypeMismatchError,
      );
      await expect(service.updateCategory(ADMIN_ID, root.id, { type: 'CARD' })).rejects.toThrow(
        CategoryTypeMismatchError,
      );
      await expect(
        service.updateCategory(ADMIN_ID, free.id, { type: 'CARD' }),
      ).resolves.toMatchObject({ type: 'CARD' });
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
