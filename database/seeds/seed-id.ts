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
  addresses: 14,
  sellerVerifications: 15,
  sellerDocuments: 16,
  globalNotifications: 17,
  marketplaceAddresses: 30,
  listings: 31,
  orders: 32,
  payments: 33,
  priceHistory: 35,
  listingMessages: 36,
  cardConditions: 37,
  profiles: 38,
  legacyProfileAddresses: 39,
  collections: 40,
  userAlbums: 41,
  collectionCards: 42,
  conversations: 43,
  messages: 44,
  userBlocks: 45,
  contactReports: 46,
  reportEvidences: 47,
  listingPhotos: 48,
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
