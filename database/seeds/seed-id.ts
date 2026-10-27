import { createHash } from 'node:crypto';

export const SeedNamespace = {
  users: 1,
  categories: 2,
  rarities: 3,
  languages: 4,
  albums: 5,
  cards: 6,
  groups: 7,
  groupMembers: 8,
  groupMessages: 9,
  reports: 10,
  catalogRequests: 11,
  globalSettings: 12,
  auditLogs: 13,
} as const;

type SeedNamespaceValue = (typeof SeedNamespace)[keyof typeof SeedNamespace];

const SEED_TIMESTAMP_HEX = '0190a000-0000';

export function seedId(namespace: SeedNamespaceValue, key: string): string {
  const hash = createHash('sha256').update(`${namespace}:${key}`).digest('hex');
  const namespaceHex = namespace.toString(16).padStart(3, '0');
  return `${SEED_TIMESTAMP_HEX}-7${namespaceHex}-8${hash.slice(0, 3)}-${hash.slice(3, 15)}`;
}

export type KeyResolver = (key: string) => string;

export function keyResolver(
  namespace: SeedNamespaceValue,
  records: { key: string }[],
  fileName: string,
): KeyResolver {
  const keys = new Set(records.map((record) => record.key));

  return (key) => {
    if (!keys.has(key)) throw new Error(`Seed: "${key}" não existe em data/${fileName}`);
    return seedId(namespace, key);
  };
}

export const optional =
  (resolve: KeyResolver) =>
  (key?: string): string | undefined =>
    key === undefined ? undefined : resolve(key);
