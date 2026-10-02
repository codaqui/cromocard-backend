export const notDeleted = { deletedAt: null } as const;

export function softDeleteData(): { deletedAt: Date } {
  return { deletedAt: new Date() };
}
