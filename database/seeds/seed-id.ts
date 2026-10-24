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

export function seedId(namespace: SeedNamespaceValue, index: number): string {
  const namespaceHex = namespace.toString(16).padStart(3, '0');
  const indexHex = index.toString(16).padStart(12, '0');
  return `${SEED_TIMESTAMP_HEX}-7${namespaceHex}-8000-${indexHex}`;
}
