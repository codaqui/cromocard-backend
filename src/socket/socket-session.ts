import type { AppSocket } from './socket.types';

const MAX_TIMER_MS = 2_147_483_647;

export function disconnectWhenTokenExpires(socket: AppSocket): void {
  const remaining = Math.max(0, socket.data.tokenExpiresAt - Date.now());
  const timer = setTimeout(() => socket.disconnect(true), Math.min(remaining, MAX_TIMER_MS));
  socket.once('disconnect', () => clearTimeout(timer));
}
