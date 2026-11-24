import type { DefaultEventsMap, Server, Socket } from 'socket.io';

import type { ErrorDetail } from '@/shared/errors/app-error';
import type { AuthenticatedUser } from '@/shared/types/authenticated-user';

/** Dados que o middleware de autenticação grava em cada socket conectado. */
export interface SocketData {
  user: AuthenticatedUser;
}

/** Eventos livres: cada domínio valida o payload do seu evento com Zod no handler. */
type AnyEvents = DefaultEventsMap;

export type AppSocketServer = Server<AnyEvents, AnyEvents, AnyEvents, SocketData>;
export type AppSocket = Socket<AnyEvents, AnyEvents, AnyEvents, SocketData>;

/** Registra os handlers de um domínio em cada conexão (ex.: `chat.socket.ts`, `group-messages.socket.ts`). */
export type SocketHandlers = (io: AppSocketServer, socket: AppSocket) => void;

/** Resposta do ack no formato do ADR-011: `{ data }` no sucesso, `{ error, message, details? }` na falha. */
export type AckResponse<T> =
  { data: T } | { error: string; message: string; details?: ErrorDetail[] };

export type Ack<T> = (response: AckResponse<T>) => void;
