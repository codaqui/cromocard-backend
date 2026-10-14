import 'express-serve-static-core';

import type { AuthenticatedUser } from '@/shared/types/authenticated-user';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}
