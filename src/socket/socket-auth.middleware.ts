import type { ExtendedError } from 'socket.io';

import { verifyAccessToken } from '@/lib/jwt';

import type { AppSocket } from './socket.types';

const UNAUTHORIZED = { error: 'UNAUTHORIZED', message: 'Autenticação necessária' } as const;

function unauthorized(): ExtendedError {
  const error: ExtendedError = new Error(UNAUTHORIZED.error);
  error.data = UNAUTHORIZED;
  return error;
}

function tokenOf(socket: AppSocket): string | undefined {
  const { token } = socket.handshake.auth as { token?: unknown };
  return typeof token === 'string' && token.length > 0 ? token : undefined;
}

export function authenticateSocket(socket: AppSocket, next: (error?: ExtendedError) => void): void {
  const token = tokenOf(socket);
  if (!token) {
    next(unauthorized());
    return;
  }
  try {
    socket.data.user = verifyAccessToken(token);
    next();
  } catch {
    next(unauthorized());
  }
}
