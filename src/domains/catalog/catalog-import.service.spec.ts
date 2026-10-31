import { beforeEach, describe, expect, it } from 'vitest';

import type { RecordAuditLogInput } from '@/domains/admin/audit-logs/audit-logs.validator';
import type { ErrorDetail } from '@/shared/errors/app-error';

import { CsvInvalidError } from './catalog.errors';
import { CARD_IMPORT_TEMPLATE } from './catalog-import.parser';
import type {
  CardNumberRecord,
  CatalogImportRepository,
  ImportedCard,
  NamedReference,
} from './catalog-import.repository';
import { CatalogImportService } from './catalog-import.service';

const HEADER = 'album_title;number;name;rarity;language;category';
const ADMIN_ID = crypto.randomUUID();

function reference(name: string): NamedReference {
  return { id: crypto.randomUUID(), name };
}

function matchingNames(references: NamedReference[], names: string[]) {
  const wanted = names.map((name) => name.toLowerCase());
  return references.filter(({ name }) => wanted.includes(name.toLowerCase()));
}

class InMemoryCatalogImportRepository implements CatalogImportRepository {
  albums = [reference('Copa 2026'), reference('Pokémon Base')];
  categories = [reference('Futebol')];
  rarities = [reference('Comum'), reference('Rara')];
  languages = [reference('pt-BR'), reference('en')];
  cardNumbers: CardNumberRecord[] = [];
  saved: ImportedCard[] = [];

  findAlbumsByTitles(titles: string[]): Promise<NamedReference[]> {
    return Promise.resolve(matchingNames(this.albums, titles));
  }

  findCardCategoriesByNames(names: string[]): Promise<NamedReference[]> {
    return Promise.resolve(matchingNames(this.categories, names));
  }

  findRarities(): Promise<NamedReference[]> {
    return Promise.resolve(this.rarities);
  }

  findLanguagesByCode(): Promise<NamedReference[]> {
    return Promise.resolve(this.languages);
  }

  findCardNumbers(albumIds: string[]): Promise<CardNumberRecord[]> {
    return Promise.resolve(
      this.cardNumbers.filter(({ albumId }) => albumId && albumIds.includes(albumId)),
    );
  }

  saveCards(cards: ImportedCard[]): Promise<void> {
    this.saved.push(...cards);
    return Promise.resolve();
  }

  albumId(title: string): string {
    return this.albums.find(({ name }) => name === title)?.id ?? '';
  }
}

class InMemoryAuditLog {
  entries: RecordAuditLogInput[] = [];

  record(input: RecordAuditLogInput): Promise<void> {
    this.entries.push(input);
    return Promise.resolve();
  }
}

function csv(...lines: string[]): Buffer {
  return Buffer.from([HEADER, ...lines].join('\n'));
}

async function importErrors(promise: Promise<unknown>): Promise<ErrorDetail[]> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(CsvInvalidError);
  return (error as CsvInvalidError).details ?? [];
}

describe('CatalogImportService', () => {
  let repository: InMemoryCatalogImportRepository;
  let auditLog: InMemoryAuditLog;
  let service: CatalogImportService;

  beforeEach(() => {
    repository = new InMemoryCatalogImportRepository();
    auditLog = new InMemoryAuditLog();
    service = new CatalogImportService(repository, auditLog);
  });

  it('CA5: importa as 50 cartas de um CSV válido e devolve o total', async () => {
    const lines = Array.from(
      { length: 50 },
      (_, i) => `Copa 2026;${i + 1};Jogador ${i + 1};Comum;pt-BR;Futebol`,
    );

    const result = await service.importCards(ADMIN_ID, csv(...lines));

    expect(result).toEqual({ created: 50 });
    expect(repository.saved).toHaveLength(50);
    expect(repository.saved[0]).toEqual({
      name: 'Jogador 1',
      number: '1',
      albumId: repository.albumId('Copa 2026'),
      categoryId: repository.categories[0]?.id,
      rarityId: repository.rarities[0]?.id,
      languageId: repository.languages[0]?.id,
    });
  });

  it('R14: registra a importação na auditoria', async () => {
    await service.importCards(ADMIN_ID, csv('Copa 2026;1;Jogador;;;'));

    expect(auditLog.entries).toEqual([
      { adminId: ADMIN_ID, action: 'CARDS_IMPORTED', entityType: 'card', details: { created: 1 } },
    ]);
  });

  it('R13: aceita BOM, linhas em branco, maiúsculas diferentes e colunas opcionais vazias', async () => {
    const content = Buffer.from(
      `\uFEFF${HEADER.toUpperCase()}\n\ncopa 2026;7;Goleiro;RARA;EN;futebol\n;;Avulsa;;;\n`,
    );

    await expect(service.importCards(ADMIN_ID, content)).resolves.toEqual({ created: 2 });
    expect(repository.saved[1]).toMatchObject({ name: 'Avulsa', albumId: null, number: null });
  });

  it('CA6: com linhas inválidas não grava nada e lista cada linha com o erro', async () => {
    const content = csv(
      'Copa 2026;1;Válida;Comum;pt-BR;',
      'Álbum Inexistente;2;Sem álbum;;;',
      'Copa 2026;3;;;;',
      'Copa 2026;4;Raridade errada;Mítica;pt-BR;',
      'Copa 2026;5;Idioma por nome;;Português;',
    );

    const errors = await importErrors(service.importCards(ADMIN_ID, content));

    expect(repository.saved).toEqual([]);
    expect(auditLog.entries).toEqual([]);
    expect(errors.map(({ field }) => field)).toEqual([
      '3.album_title',
      '4.name',
      '5.rarity',
      '6.language',
    ]);
  });

  it('CA6: aponta número repetido no arquivo e número já usado no álbum', async () => {
    repository.cardNumbers.push({
      id: crypto.randomUUID(),
      albumId: repository.albumId('Copa 2026'),
      number: '10',
      deletedAt: null,
    });

    const errors = await importErrors(
      service.importCards(
        ADMIN_ID,
        csv('Copa 2026;10;Ocupada;;;', 'Copa 2026;11;Primeira;;;', 'Copa 2026;11;Repetida;;;'),
      ),
    );

    expect(errors).toEqual([
      { field: '2.number', message: 'Número já usado no álbum' },
      { field: '4.number', message: 'Número repetido no arquivo para o mesmo álbum' },
    ]);
  });

  it('CA6: aponta o álbum com título repetido no catálogo como ambíguo', async () => {
    repository.albums.push(reference('Copa 2026'));

    const errors = await importErrors(service.importCards(ADMIN_ID, csv('Copa 2026;1;Jogador;;;')));

    expect(errors).toEqual([
      { field: '2.album_title', message: '"Copa 2026" aparece mais de uma vez em álbuns' },
    ]);
  });

  it('R7: o número de uma carta excluída restaura a mesma linha', async () => {
    const deletedId = crypto.randomUUID();
    repository.cardNumbers.push({
      id: deletedId,
      albumId: repository.albumId('Copa 2026'),
      number: '10',
      deletedAt: new Date(),
    });

    await service.importCards(ADMIN_ID, csv('Copa 2026;10;Volta;;;'));

    expect(repository.saved[0]).toMatchObject({ restoreId: deletedId, name: 'Volta' });
  });

  it('CA6: aponta linha com quantidade errada de colunas', async () => {
    const errors = await importErrors(service.importCards(ADMIN_ID, csv('Copa 2026;1;Jogador')));

    expect(errors).toEqual([
      { field: '2.columns', message: 'A linha deve ter 6 colunas separadas por ;' },
    ]);
  });

  it('R13: recusa arquivo sem o cabeçalho do modelo', async () => {
    const errors = await importErrors(
      service.importCards(ADMIN_ID, Buffer.from('nome;numero\nJogador;1')),
    );

    expect(errors).toEqual([{ field: 'file', message: `A primeira linha deve ser ${HEADER}` }]);
  });

  it('R13: recusa arquivo vazio ou só com o cabeçalho', async () => {
    await expect(service.importCards(ADMIN_ID, Buffer.from(''))).rejects.toThrow(CsvInvalidError);
    await expect(service.importCards(ADMIN_ID, Buffer.from(CARD_IMPORT_TEMPLATE))).rejects.toThrow(
      CsvInvalidError,
    );
  });

  it('R13: recusa CSV malformado', async () => {
    const errors = await importErrors(
      service.importCards(ADMIN_ID, csv('Copa 2026;1;"Aspas sem fechar;;;')),
    );

    expect(errors[0]?.field).toBe('file');
  });
});
