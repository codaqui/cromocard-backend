import { CsvInvalidError } from './catalog.errors';
import type { CatalogAuditLog } from './catalog.service';
import { type CardImportRow, parseCardImport } from './catalog-import.parser';
import type { CatalogImportRepository } from './catalog-import.repository';
import {
  checkNumbers,
  indexByName,
  type ReferenceIndexes,
  resolveReferences,
  type ResolvedRow,
  sortByLine,
} from './catalog-import.rows';

export interface CardImportResult {
  created: number;
}

function distinctValues(rows: CardImportRow[], column: 'album_title' | 'category'): string[] {
  return [...new Set(rows.flatMap((row) => (row[column] ? [row[column]] : [])))];
}

function albumIdsOf(rows: ResolvedRow[]): string[] {
  return [...new Set(rows.flatMap(({ card }) => (card.albumId ? [card.albumId] : [])))];
}

export class CatalogImportService {
  constructor(
    private readonly repository: CatalogImportRepository,
    private readonly auditLog: CatalogAuditLog,
  ) {}

  async importCards(adminId: string, content: Buffer): Promise<CardImportResult> {
    const { rows, errors } = parseCardImport(content);
    const resolved = await this.resolveRows(rows);
    const problems = [...errors, ...resolved.flatMap((row) => row.errors)];
    if (problems.length > 0) throw new CsvInvalidError(sortByLine(problems));

    const cards = resolved.map(({ card }) => card);
    await this.repository.saveCards(cards);
    await this.auditLog.record({
      adminId,
      action: 'CARDS_IMPORTED',
      entityType: 'card',
      details: { created: cards.length },
    });
    return { created: cards.length };
  }

  private async resolveRows(rows: CardImportRow[]): Promise<ResolvedRow[]> {
    const indexes = await this.loadIndexes(rows);
    const withReferences = rows.map((row) => resolveReferences(row, indexes));
    const existing = await this.repository.findCardNumbers(albumIdsOf(withReferences));
    return checkNumbers(withReferences, existing);
  }

  private async loadIndexes(rows: CardImportRow[]): Promise<ReferenceIndexes> {
    const [albums, categories, rarities, languages] = await Promise.all([
      this.repository.findAlbumsByTitles(distinctValues(rows, 'album_title')),
      this.repository.findCardCategoriesByNames(distinctValues(rows, 'category')),
      this.repository.findRarities(),
      this.repository.findLanguagesByCode(),
    ]);

    return {
      album_title: indexByName(albums),
      category: indexByName(categories),
      rarity: indexByName(rarities),
      language: indexByName(languages),
    };
  }
}
