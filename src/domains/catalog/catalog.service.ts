import type {
  AuditAction,
  RecordAuditLogInput,
} from '@/domains/admin/audit-logs/audit-logs.validator';
import type { AppError } from '@/shared/errors/app-error';
import { buildPaginationMeta, type Paginated } from '@/shared/utils/pagination';

import type { Album, AlbumsRepository } from './albums.repository';
import type { Card, CardsRepository } from './cards.repository';
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
import type {
  CreateAlbumInput,
  CreateCardInput,
  CreateCategoryInput,
  ListAlbumsQuery,
  ListCardsQuery,
  ListCategoriesQuery,
  UpdateAlbumInput,
  UpdateCardInput,
  UpdateCategoryInput,
} from './catalog.validator';
import type { CategoriesRepository, Category } from './categories.repository';
import type { CatalogReference, ReferencesRepository } from './references.repository';

export interface CatalogAuditLog {
  record(input: RecordAuditLogInput): Promise<unknown>;
}

export interface CardUsage {
  isCardInCollections(cardId: string): Promise<boolean>;
}

export interface CatalogServiceDeps {
  albums: AlbumsRepository;
  cards: CardsRepository;
  categories: CategoriesRepository;
  references: ReferencesRepository;
  auditLog: CatalogAuditLog;
  cardUsage?: CardUsage;
}

interface AuditedChange {
  action: AuditAction;
  entityType: 'album' | 'card' | 'category';
  entityId: string;
}

interface CardReferences {
  albumId?: string | null;
  categoryId?: string | null;
  rarityId?: string | null;
  languageId?: string | null;
}

interface CardNumberSlot {
  albumId?: string | null;
  number?: string | null;
}

type ReferenceLookup = (id: string) => Promise<boolean>;

async function ensureReference(
  id: string | null | undefined,
  exists: ReferenceLookup,
  notFound: () => AppError,
): Promise<void> {
  if (id && !(await exists(id))) throw notFound();
}

function keepOrReplace<T>(replacement: T | undefined, current: T): T {
  return replacement === undefined ? current : replacement;
}

export class CatalogService {
  constructor(private readonly deps: CatalogServiceDeps) {}

  async listAlbums(query: ListAlbumsQuery): Promise<Paginated<Album>> {
    const { items, total } = await this.deps.albums.findPage(query);
    return { items, meta: buildPaginationMeta(query, total) };
  }

  async findAlbum(id: string): Promise<Album> {
    const album = await this.deps.albums.findById(id);
    if (!album) throw new AlbumNotFoundError();
    return album;
  }

  async createAlbum(adminId: string, input: CreateAlbumInput): Promise<Album> {
    await this.ensureCategory(input.categoryId);
    const album = await this.deps.albums.create(input);
    await this.audit(adminId, { action: 'ALBUM_CREATED', entityType: 'album', entityId: album.id });
    return album;
  }

  async updateAlbum(adminId: string, id: string, input: UpdateAlbumInput): Promise<Album> {
    await this.findAlbum(id);
    await this.ensureCategory(input.categoryId);
    const album = await this.deps.albums.update(id, input);
    await this.audit(adminId, { action: 'ALBUM_UPDATED', entityType: 'album', entityId: id });
    return album;
  }

  async deleteAlbum(adminId: string, id: string): Promise<void> {
    await this.findAlbum(id);
    if ((await this.deps.cards.countByAlbum(id)) > 0) throw new AlbumHasCardsError();
    await this.deps.albums.softDelete(id);
    await this.audit(adminId, { action: 'ALBUM_DELETED', entityType: 'album', entityId: id });
  }

  async listCards(query: ListCardsQuery): Promise<Paginated<Card>> {
    const { items, total } = await this.deps.cards.findPage(query);
    return { items, meta: buildPaginationMeta(query, total) };
  }

  async findCard(id: string): Promise<Card> {
    const card = await this.deps.cards.findById(id);
    if (!card) throw new CardNotFoundError();
    return card;
  }

  async createCard(adminId: string, input: CreateCardInput): Promise<Card> {
    await this.ensureCardReferences(input);
    const card = await this.saveNewCard(input);
    await this.refreshTotalCards(card.albumId);
    await this.audit(adminId, { action: 'CARD_CREATED', entityType: 'card', entityId: card.id });
    return card;
  }

  async updateCard(adminId: string, id: string, input: UpdateCardInput): Promise<Card> {
    const { albumId: previousAlbumId, number: previousNumber } = await this.findCard(id);
    await this.ensureCardReferences(input);
    await this.ensureNumberAvailable(id, {
      albumId: keepOrReplace(input.albumId, previousAlbumId),
      number: keepOrReplace(input.number, previousNumber),
    });
    const card = await this.deps.cards.update(id, input);
    await this.refreshTotalCardsAfterMove(previousAlbumId, card.albumId);
    await this.audit(adminId, { action: 'CARD_UPDATED', entityType: 'card', entityId: id });
    return card;
  }

  async deleteCard(adminId: string, id: string): Promise<void> {
    const card = await this.findCard(id);
    if (await this.deps.cardUsage?.isCardInCollections(id)) throw new CardInUseError();
    await this.deps.cards.softDelete(id);
    await this.refreshTotalCards(card.albumId);
    await this.audit(adminId, { action: 'CARD_DELETED', entityType: 'card', entityId: id });
  }

  async listCategories(query: ListCategoriesQuery): Promise<Paginated<Category>> {
    const { items, total } = await this.deps.categories.findPage(query);
    return { items, meta: buildPaginationMeta(query, total) };
  }

  async findCategory(id: string): Promise<Category> {
    const category = await this.deps.categories.findById(id);
    if (!category) throw new CategoryNotFoundError();
    return category;
  }

  async createCategory(adminId: string, input: CreateCategoryInput): Promise<Category> {
    await this.ensureCategory(input.parentCategoryId);
    const category = await this.deps.categories.create(input);
    await this.audit(adminId, {
      action: 'CATEGORY_CREATED',
      entityType: 'category',
      entityId: category.id,
    });
    return category;
  }

  async updateCategory(adminId: string, id: string, input: UpdateCategoryInput): Promise<Category> {
    await this.findCategory(id);
    await this.ensureCategory(input.parentCategoryId);
    const category = await this.deps.categories.update(id, input);
    await this.audit(adminId, { action: 'CATEGORY_UPDATED', entityType: 'category', entityId: id });
    return category;
  }

  async deleteCategory(adminId: string, id: string): Promise<void> {
    await this.findCategory(id);
    if (await this.deps.categories.isInUse(id)) throw new CategoryInUseError();
    await this.deps.categories.softDelete(id);
    await this.audit(adminId, { action: 'CATEGORY_DELETED', entityType: 'category', entityId: id });
  }

  listRarities(): Promise<CatalogReference[]> {
    return this.deps.references.listRarities();
  }

  listLanguages(): Promise<CatalogReference[]> {
    return this.deps.references.listLanguages();
  }

  private async saveNewCard(input: CreateCardInput): Promise<Card> {
    const owner = await this.findNumberOwner(input);
    if (!owner) return this.deps.cards.create(input);
    if (!owner.deletedAt) throw new CardNumberTakenError();
    return this.deps.cards.restore(owner.id, input);
  }

  private async ensureNumberAvailable(cardId: string, slot: CardNumberSlot) {
    const owner = await this.findNumberOwner(slot);
    if (owner && owner.id !== cardId) throw new CardNumberTakenError();
  }

  private findNumberOwner({ albumId, number }: CardNumberSlot) {
    if (!albumId || !number) return Promise.resolve(null);
    return this.deps.cards.findByAlbumNumberIncludingDeleted({ albumId, number });
  }

  private async ensureCardReferences(input: CardReferences): Promise<void> {
    await Promise.all([
      this.ensureAlbum(input.albumId),
      this.ensureCategory(input.categoryId),
      this.ensureRarity(input.rarityId),
      this.ensureLanguage(input.languageId),
    ]);
  }

  private ensureAlbum(albumId: string | null | undefined): Promise<void> {
    const { albums } = this.deps;
    return ensureReference(
      albumId,
      async (id) => (await albums.findById(id)) !== null,
      () => new AlbumNotFoundError(),
    );
  }

  private ensureRarity(rarityId: string | null | undefined): Promise<void> {
    const { references } = this.deps;
    return ensureReference(
      rarityId,
      (id) => references.rarityExists(id),
      () => new RarityNotFoundError(),
    );
  }

  private ensureLanguage(languageId: string | null | undefined): Promise<void> {
    const { references } = this.deps;
    return ensureReference(
      languageId,
      (id) => references.languageExists(id),
      () => new LanguageNotFoundError(),
    );
  }

  private ensureCategory(categoryId: string | null | undefined): Promise<void> {
    const { categories } = this.deps;
    return ensureReference(
      categoryId,
      async (id) => (await categories.findById(id)) !== null,
      () => new CategoryNotFoundError(),
    );
  }

  private async refreshTotalCards(albumId: string | null): Promise<void> {
    if (!albumId) return;
    await this.deps.albums.updateTotalCards(albumId, await this.deps.cards.countByAlbum(albumId));
  }

  private async refreshTotalCardsAfterMove(from: string | null, to: string | null) {
    if (from === to) return;
    await this.refreshTotalCards(from);
    await this.refreshTotalCards(to);
  }

  private async audit(adminId: string, change: AuditedChange): Promise<void> {
    await this.deps.auditLog.record({ adminId, ...change });
  }
}
