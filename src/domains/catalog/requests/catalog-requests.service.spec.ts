import { beforeEach, describe, expect, it } from 'vitest';

import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { Transaction } from '@/lib/transaction';
import { CardNumberTakenError } from '@/domains/catalog/catalog.errors';
import type {
  CreateAlbumInput,
  CreateCardInput,
  CreateCategoryInput,
} from '@/domains/catalog/catalog.validator';

import {
  CatalogRequestAlreadyReviewedError,
  CatalogRequestDataIncompleteError,
  CatalogRequestNotFoundError,
} from './catalog-requests.errors';
import type {
  CatalogRequestRecord,
  CatalogRequestsRepository,
  CreatedItemLink,
  ReferenceIds,
  ReviewInput,
} from './catalog-requests.repository';
import {
  type CatalogRequestsCatalog,
  CatalogRequestsService,
  type RequesterNotice,
  codeOf,
  itemNameOf,
} from './catalog-requests.service';
import type { ListCatalogRequestsQuery } from './catalog-requests.validator';

const ADMIN_ID = '0199a000-0000-7000-8000-000000000001';
const OTHER_ADMIN_ID = '0199a000-0000-7000-8000-000000000002';
const REQUESTER_ID = '0199a000-0000-7000-8000-000000000003';
const REQUEST_ID = '0199a000-0000-7000-8000-0000000088a2';
const ALBUM_ID = '0199a000-0000-7000-8000-000000000010';
const FRANCHISE_ID = '0199a000-0000-7000-8000-000000000011';
const RARITY_ID = '0199a000-0000-7000-8000-000000000012';
const LANGUAGE_ID = '0199a000-0000-7000-8000-000000000013';
const CREATED_ID = '0199a000-0000-7000-8000-000000000099';
const QUERY: ListCatalogRequestsQuery = { page: 1, pageSize: 10, status: 'PENDING' };
const TX = { id: 'tx' } as unknown as Transaction;

const cardData = {
  name: 'Pikachu Promo Illustrator',
  number: '022',
  albumId: ALBUM_ID,
  categoryId: FRANCHISE_ID,
  rarityId: RARITY_ID,
  languageId: LANGUAGE_ID,
  frontImageUrl: 'https://cdn.cromocard.dev/cards/pikachu.png',
};

function buildRequest(overrides: Partial<CatalogRequestRecord> = {}): CatalogRequestRecord {
  return {
    id: REQUEST_ID,
    type: 'CARD',
    status: 'PENDING',
    data: cardData,
    createdAt: new Date('2026-11-10T12:00:00Z'),
    cardId: null,
    albumId: null,
    reviewedAt: null,
    requester: { id: REQUESTER_ID, name: 'Lucas', username: 'lucas_slab_collector' },
    reviewedBy: null,
    ...overrides,
  };
}

class FakeRepository implements CatalogRequestsRepository {
  requests = new Map<string, CatalogRequestRecord>();
  transactions: { write: string; tx?: Transaction }[] = [];
  lastQuery?: ListCatalogRequestsQuery;
  lastReferenceIds?: ReferenceIds;
  stolenBy?: CatalogRequestRecord['reviewedBy'];

  findPage(query: ListCatalogRequestsQuery) {
    this.lastQuery = query;
    const items = [...this.requests.values()].filter(({ status }) => status === query.status);
    return Promise.resolve({ items, total: items.length });
  }

  countPendingByType() {
    return Promise.resolve({ CARD: 8, ALBUM: 4, CATEGORY: 2 });
  }

  findById(id: string) {
    return Promise.resolve(this.requests.get(id) ?? null);
  }

  findReferenceNames(ids: ReferenceIds) {
    this.lastReferenceIds = ids;
    return Promise.resolve(
      new Map([
        [ALBUM_ID, 'CoroCoro Comics'],
        [FRANCHISE_ID, 'Pokémon'],
        [RARITY_ID, 'Lendária'],
        [LANGUAGE_ID, 'Japonês'],
      ]),
    );
  }

  markReviewed(id: string, { status, reviewedById, data }: ReviewInput, tx?: Transaction) {
    this.transactions.push({ write: 'markReviewed', tx });
    const request = this.requests.get(id)!;
    if (this.stolenBy) {
      this.requests.set(id, { ...request, status: 'APPROVED', reviewedBy: this.stolenBy });
      return Promise.resolve(false);
    }
    const reviewedBy = { id: reviewedById, name: 'Admin', username: 'fernanda_bi' };
    this.requests.set(id, {
      ...request,
      status,
      reviewedBy,
      reviewedAt: new Date('2026-11-16T14:52:00Z'),
      data: (data as CatalogRequestRecord['data']) ?? request.data,
    });
    return Promise.resolve(true);
  }

  revertToPending(id: string) {
    const request = this.requests.get(id)!;
    this.requests.set(id, { ...request, status: 'PENDING', reviewedBy: null, reviewedAt: null });
    return Promise.resolve();
  }

  linkCreatedItem(id: string, { cardId, albumId, data }: CreatedItemLink, tx?: Transaction) {
    this.transactions.push({ write: 'linkCreatedItem', tx });
    const request = this.requests.get(id)!;
    this.requests.set(id, {
      ...request,
      cardId: cardId ?? request.cardId,
      albumId: albumId ?? request.albumId,
      data: (data as CatalogRequestRecord['data']) ?? request.data,
    });
    return Promise.resolve();
  }
}

class FakeNotifier {
  notices: RequesterNotice[] = [];
  transactions: (Transaction | undefined)[] = [];

  notify(notice: RequesterNotice, tx?: Transaction) {
    this.notices.push(notice);
    this.transactions.push(tx);
    return Promise.resolve();
  }
}

class FakeCatalog implements CatalogRequestsCatalog {
  cards: CreateCardInput[] = [];
  albums: CreateAlbumInput[] = [];
  categories: CreateCategoryInput[] = [];
  failWith?: Error;

  createCard(_adminId: string, input: CreateCardInput) {
    if (this.failWith) return Promise.reject(this.failWith);
    this.cards.push(input);
    return Promise.resolve({ id: CREATED_ID, name: input.name });
  }

  createAlbum(_adminId: string, input: CreateAlbumInput) {
    this.albums.push(input);
    return Promise.resolve({ id: CREATED_ID, title: input.title });
  }

  createCategory(_adminId: string, input: CreateCategoryInput) {
    this.categories.push(input);
    return Promise.resolve({ id: CREATED_ID, name: input.name });
  }
}

describe('CatalogRequestsService', () => {
  let repository: FakeRepository;
  let catalog: FakeCatalog;
  let audits: RecordAuditLogInput[];
  let auditTransactions: (Transaction | undefined)[];
  let notifier: FakeNotifier;
  let service: CatalogRequestsService;

  const stored = () => repository.requests.get(REQUEST_ID)!;
  const store = (overrides: Partial<CatalogRequestRecord> = {}) =>
    repository.requests.set(REQUEST_ID, buildRequest(overrides));

  beforeEach(() => {
    repository = new FakeRepository();
    catalog = new FakeCatalog();
    audits = [];
    auditTransactions = [];
    notifier = new FakeNotifier();
    service = new CatalogRequestsService({
      repository,
      catalog,
      auditLog: {
        record: (input, tx) => {
          auditTransactions.push(tx);
          return Promise.resolve(audits.push(input));
        },
      },
      notifier,
      runInTransaction: (work) => work(TX),
    });
    store();
  });

  describe('list', () => {
    it('CA1: lista as pendentes com o código, os nomes sugeridos e a contagem por tipo', async () => {
      const { items, meta } = await service.list(QUERY);

      expect(meta.pendingByType).toEqual({ CARD: 8, ALBUM: 4, CATEGORY: 2, ALL: 14 });
      expect(meta.total).toBe(1);
      expect(items[0]).toMatchObject({
        code: '#SOL-88A2',
        references: {
          album: 'CoroCoro Comics',
          category: 'Pokémon',
          rarity: 'Lendária',
          language: 'Japonês',
        },
      });
      expect(repository.lastReferenceIds?.languageIds).toEqual([LANGUAGE_ID]);
    });

    it('não procura nomes de referências que a sugestão não tem', async () => {
      store({ type: 'CATEGORY', data: { name: 'Fórmula 1', type: 'ALBUM' } });

      const { items } = await service.list(QUERY);

      expect(repository.lastReferenceIds?.albumIds).toEqual([]);
      expect(items[0]?.references).toEqual({});
    });
  });

  describe('find', () => {
    it('mostra a solicitação com os dados sugeridos', async () => {
      await expect(service.find(REQUEST_ID)).resolves.toMatchObject({ data: cardData });
    });

    it('responde 404 para uma solicitação que não existe', async () => {
      await expect(service.find(CREATED_ID)).rejects.toBeInstanceOf(CatalogRequestNotFoundError);
    });
  });

  describe('approve', () => {
    it('CA2: cria a carta publicada, liga a solicitação, registra o log e avisa o solicitante', async () => {
      const approved = await service.approve(REQUEST_ID, ADMIN_ID);

      expect(catalog.cards).toEqual([cardData]);
      expect(approved.createdItem).toEqual({
        type: 'CARD',
        id: CREATED_ID,
        name: 'Pikachu Promo Illustrator',
      });
      expect(stored()).toMatchObject({ status: 'APPROVED', cardId: CREATED_ID });
      expect(stored().reviewedBy?.id).toBe(ADMIN_ID);
      expect(audits).toEqual([
        expect.objectContaining({
          adminId: ADMIN_ID,
          action: 'CATALOG_REQUEST_APPROVED',
          entityId: REQUEST_ID,
          details: { type: 'CARD', createdItemId: CREATED_ID },
        }),
      ]);
      expect(notifier.notices).toEqual([
        {
          userId: REQUESTER_ID,
          title: 'Sua sugestão foi aprovada',
          message: 'Pikachu Promo Illustrator entrou no catálogo do CromoCard.',
          type: 'CATALOG_REQUEST',
        },
      ]);
    });

    it('R16: liga o item, registra o log e avisa o solicitante na mesma transação', async () => {
      await service.approve(REQUEST_ID, ADMIN_ID);

      expect(repository.transactions).toContainEqual({ write: 'linkCreatedItem', tx: TX });
      expect(auditTransactions).toEqual([TX]);
      expect(notifier.transactions).toEqual([TX]);
    });

    it('CA3: aprovar um álbum cria só o álbum e liga em album_id', async () => {
      store({ type: 'ALBUM', data: { title: 'Pokémon Jungle', publisher: 'Wizards', year: 1999 } });

      await service.approve(REQUEST_ID, ADMIN_ID);

      expect(catalog.albums).toEqual([
        { title: 'Pokémon Jungle', publisher: 'Wizards', year: 1999 },
      ]);
      expect(catalog.cards).toEqual([]);
      expect(stored().albumId).toBe(CREATED_ID);
    });

    it('aprovar uma categoria cria a categoria e guarda o id em data.createdCategoryId', async () => {
      store({ type: 'CATEGORY', data: { name: 'Fórmula 1', type: 'ALBUM' } });

      await service.approve(REQUEST_ID, ADMIN_ID);

      expect(catalog.categories).toEqual([{ name: 'Fórmula 1', type: 'ALBUM' }]);
      expect(stored().data).toEqual({
        name: 'Fórmula 1',
        type: 'ALBUM',
        createdCategoryId: CREATED_ID,
      });
    });

    it('CA5: recusa aprovar de novo e informa quem analisou e quando', async () => {
      store({
        status: 'APPROVED',
        reviewedAt: new Date('2026-11-16T14:52:00Z'),
        reviewedBy: { id: OTHER_ADMIN_ID, name: 'Fernanda', username: 'fernanda_bi' },
      });

      const error = await service.approve(REQUEST_ID, ADMIN_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CatalogRequestAlreadyReviewedError);
      expect((error as CatalogRequestAlreadyReviewedError).details).toEqual([
        { field: 'status', message: 'APPROVED' },
        { field: 'reviewedBy', message: 'fernanda_bi' },
        { field: 'reviewedAt', message: '2026-11-16T14:52:00.000Z' },
      ]);
      expect(catalog.cards).toEqual([]);
    });

    it('CA5: se outro admin analisou no meio do caminho, nada é criado e informa quem foi', async () => {
      repository.stolenBy = { id: OTHER_ADMIN_ID, name: 'Fernanda', username: null };

      const error = await service.approve(REQUEST_ID, ADMIN_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CatalogRequestAlreadyReviewedError);
      expect((error as CatalogRequestAlreadyReviewedError).details?.[1]).toEqual({
        field: 'reviewedBy',
        message: 'Fernanda',
      });
      expect(catalog.cards).toEqual([]);
    });

    it('CA6: conflito do catálogo mantém a solicitação pendente, sem log nem aviso', async () => {
      catalog.failWith = new CardNumberTakenError();

      await expect(service.approve(REQUEST_ID, ADMIN_ID)).rejects.toBeInstanceOf(
        CardNumberTakenError,
      );

      expect(stored()).toMatchObject({ status: 'PENDING', reviewedBy: null, reviewedAt: null });
      expect(audits).toEqual([]);
      expect(notifier.notices).toEqual([]);
    });

    it('CA8: sugestão de carta sem idioma responde 422 com o campo e continua pendente', async () => {
      const withoutLanguage: Record<string, string> = { ...cardData };
      delete withoutLanguage.languageId;
      store({ data: withoutLanguage });

      const error = await service.approve(REQUEST_ID, ADMIN_ID).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CatalogRequestDataIncompleteError);
      expect(
        (error as CatalogRequestDataIncompleteError).details?.map(({ field }) => field),
      ).toEqual(['languageId']);
      expect(stored().status).toBe('PENDING');
      expect(catalog.cards).toEqual([]);
    });

    it('responde 404 ao aprovar uma solicitação que não existe', async () => {
      await expect(service.approve(CREATED_ID, ADMIN_ID)).rejects.toBeInstanceOf(
        CatalogRequestNotFoundError,
      );
    });
  });

  describe('reject', () => {
    const REASON = 'Carta promocional sem fonte oficial que comprove a tiragem.';

    it('CA4: recusa com motivo, guarda em data.rejectionReason, registra e avisa com o motivo', async () => {
      const rejected = await service.reject(REQUEST_ID, ADMIN_ID, { reason: REASON });

      expect(rejected.status).toBe('REJECTED');
      expect(stored().data).toEqual({ ...cardData, rejectionReason: REASON });
      expect(audits).toEqual([
        expect.objectContaining({ action: 'CATALOG_REQUEST_REJECTED', reason: REASON }),
      ]);
      expect(notifier.notices[0]).toEqual({
        userId: REQUESTER_ID,
        title: 'Sua sugestão foi recusada',
        message: `Pikachu Promo Illustrator não foi aprovada. Motivo: ${REASON}`,
        type: 'CATALOG_REQUEST',
      });
    });

    it('CA4: muda o status, registra o log e avisa o solicitante na mesma transação', async () => {
      await service.reject(REQUEST_ID, ADMIN_ID, { reason: REASON });

      expect(repository.transactions).toEqual([{ write: 'markReviewed', tx: TX }]);
      expect(auditTransactions).toEqual([TX]);
      expect(notifier.transactions).toEqual([TX]);
    });

    it('CA4: não recusa uma solicitação já analisada', async () => {
      store({ status: 'REJECTED' });

      await expect(service.reject(REQUEST_ID, ADMIN_ID, { reason: REASON })).rejects.toBeInstanceOf(
        CatalogRequestAlreadyReviewedError,
      );
      expect(audits).toEqual([]);
    });
  });
});

describe('codeOf e itemNameOf', () => {
  it('usa o fim do id no código, porque o início do UUID v7 se repete', () => {
    expect(codeOf('0199a000-0000-7000-8000-00000000abcd')).toBe('#SOL-ABCD');
  });

  it('usa o título no álbum e o nome nos outros tipos', () => {
    expect(itemNameOf('ALBUM', { title: 'Jungle' })).toBe('Jungle');
    expect(itemNameOf('CATEGORY', { name: 'Fórmula 1' })).toBe('Fórmula 1');
    expect(itemNameOf('CARD', {})).toBe('');
  });
});
