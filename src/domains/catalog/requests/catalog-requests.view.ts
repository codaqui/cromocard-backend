import type { CatalogRequestType } from '@/generated/prisma/enums';

import type { VoteCounts } from './catalog-request-votes.repository';
import type { SuggestedData } from './catalog-requests.approvals';
import type {
  CatalogRequestRecord,
  RarityRanks,
  ReferenceIds,
  ReferenceNames,
} from './catalog-requests.repository';

const CODE_PREFIX = '#SOL-';
const CODE_LENGTH = 4;
const SUMMARY_RARITIES = 3;
type ReferenceKey = 'albumId' | 'categoryId' | 'rarityId' | 'languageId';

export interface SuggestedReferences {
  album?: string;
  category?: string;
  rarity?: string;
  language?: string;
}

export interface VoteTally {
  for: number;
  neutral: number;
  against: number;
  total: number;
}

export function tallyOf({ FOR, NEUTRAL, AGAINST }: VoteCounts): VoteTally {
  return { for: FOR, neutral: NEUTRAL, against: AGAINST, total: FOR + NEUTRAL + AGAINST };
}

/** Quórum da sugestão de categoria (CCD103, R5, R9); percentuais com uma casa decimal. */
export interface QuorumVotes extends VoteTally {
  goal: number;
  forPercent: number;
  goalPercent: number;
}

export interface ChecklistSummary {
  total: number;
  rarities: { name: string; count: number }[];
}

export type CatalogRequestView = Omit<CatalogRequestRecord, 'data'> & {
  code: string;
  data: SuggestedData;
  references: SuggestedReferences;
  votes: QuorumVotes | null;
  checklistSummary: ChecklistSummary | null;
};

/** O que a página inteira precisa buscar para montar os cartões, numa leitura só. */
export interface ViewContext {
  names: ReferenceNames;
  rarityRanks: RarityRanks;
  votes: Map<string, VoteCounts>;
  goal: number;
}

interface ChecklistItem extends SuggestedData {
  rarityId?: string;
}

export const asData = (data: unknown): SuggestedData =>
  typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as SuggestedData) : {};

export const textOf = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

/** O início do UUID v7 é o horário e se repete; o fim distingue as solicitações. */
export const codeOf = (id: string): string =>
  `${CODE_PREFIX}${id.slice(-CODE_LENGTH).toUpperCase()}`;

export const itemNameOf = (type: CatalogRequestType, data: SuggestedData): string =>
  textOf(type === 'ALBUM' ? data.title : data.name) ?? '';

export const checklistOf = (data: SuggestedData): ChecklistItem[] =>
  Array.isArray(data.checklist) ? data.checklist.map(asData) : [];

export function referenceIdsOf(items: CatalogRequestRecord[]): ReferenceIds {
  const datas = items.map(({ data }) => asData(data));
  const idsOf = (key: ReferenceKey) =>
    datas.map((data) => textOf(data[key])).filter((id): id is string => Boolean(id));
  const checklistRarityIds = datas
    .flatMap(checklistOf)
    .map(({ rarityId }) => textOf(rarityId))
    .filter((id): id is string => Boolean(id));

  return {
    albumIds: idsOf('albumId'),
    categoryIds: idsOf('categoryId'),
    rarityIds: [...new Set([...idsOf('rarityId'), ...checklistRarityIds])],
    languageIds: idsOf('languageId'),
  };
}

const percent = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

export function quorumOf(counts: VoteCounts, goal: number): QuorumVotes {
  const tally = tallyOf(counts);
  return {
    ...tally,
    goal,
    forPercent: percent(tally.for, tally.total),
    goalPercent: percent(tally.total, goal),
  };
}

/** O total e as três raridades mais altas presentes no checklist (CCD103, L10). */
export function checklistSummaryOf(
  checklist: ChecklistItem[],
  rarityRanks: RarityRanks,
): ChecklistSummary | null {
  if (checklist.length === 0) return null;
  const counts = new Map<string, number>();
  checklist.forEach(({ rarityId }) => {
    const rarity = textOf(rarityId);
    if (rarity) counts.set(rarity, (counts.get(rarity) ?? 0) + 1);
  });
  const rarities = [...counts.entries()]
    .flatMap(([id, count]) => {
      const rarity = rarityRanks.get(id);
      return rarity ? [{ ...rarity, count }] : [];
    })
    .sort((a, b) => b.sortOrder - a.sortOrder)
    .slice(0, SUMMARY_RARITIES)
    .map(({ name, count }) => ({ name, count }));
  return { total: checklist.length, rarities };
}

export function dataWithRarityNames(data: SuggestedData, names: ReferenceNames): SuggestedData {
  if (!Array.isArray(data.checklist)) return data;
  const checklist = checklistOf(data).map((item) => ({
    ...item,
    rarity: names.get(textOf(item.rarityId) ?? ''),
  }));
  return { ...data, checklist };
}

export function toView(record: CatalogRequestRecord, context: ViewContext): CatalogRequestView {
  const data = asData(record.data);
  const nameOf = (key: ReferenceKey) => context.names.get(textOf(data[key]) ?? '');
  const counts = context.votes.get(record.id);

  return {
    ...record,
    code: codeOf(record.id),
    data: dataWithRarityNames(data, context.names),
    references: {
      album: nameOf('albumId'),
      category: nameOf('categoryId'),
      rarity: nameOf('rarityId'),
      language: nameOf('languageId'),
    },
    votes: record.type === 'CATEGORY' && counts ? quorumOf(counts, context.goal) : null,
    checklistSummary:
      record.type === 'ALBUM' ? checklistSummaryOf(checklistOf(data), context.rarityRanks) : null,
  };
}
