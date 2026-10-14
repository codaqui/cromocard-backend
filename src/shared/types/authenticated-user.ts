import type { UserRole } from '@/generated/prisma/enums';

export type { UserRole };

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}
