import { chatSocketHandlers } from '@/domains/chat/chat.module';

import type { SocketHandlers } from './socket.types';

export const socketHandlers: readonly SocketHandlers[] = [chatSocketHandlers];
