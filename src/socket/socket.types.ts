import type { DefaultEventsMap, Server, Socket } from 'socket.io';

import type { ErrorDetail } from '@/shared/errors/app-error';
import type { AuthenticatedUser } from '@/shared/types/authenticated-user';

export interface SocketData {
  user: AuthenticatedUser;
}

type AnyEvents = DefaultEventsMap;

export type AppSocketServer = Server<AnyEvents, AnyEvents, AnyEvents, SocketData>;
export type AppSocket = Socket<AnyEvents, AnyEvents, AnyEvents, SocketData>;

export type SocketHandlers = (io: AppSocketServer, socket: AppSocket) => void;

export type AckResponse<T> =
  { data: T } | { error: string; message: string; details?: ErrorDetail[] };

export type Ack<T> = (response: AckResponse<T>) => void;
