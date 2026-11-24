import { logger } from '@/config/logger';
import { toAppError } from '@/shared/errors/error-handler';

import type { Ack, AckResponse } from './socket.types';

const INTERNAL_ERROR = {
  error: 'INTERNAL_ERROR',
  message: 'Erro inesperado. Tente novamente mais tarde.',
} as const;

/** Converte qualquer erro no ack de falha, com o mesmo mapeamento do `errorHandler` do REST. */
export function toAckError(error: unknown): AckResponse<never> {
  const appError = toAppError(error);
  if (!appError) {
    logger.error({ err: error }, 'Erro inesperado no Socket.IO');
    return INTERNAL_ERROR;
  }
  return { error: appError.code, message: appError.message, details: appError.details };
}

/**
 * Envolve o handler de um evento: responde `{ data }` com o resultado ou o erro no formato do ADR-011.
 * Sem callback de ack, o resultado é descartado e o erro só vai para o log.
 */
export function withAck<TPayload, TResult>(handler: (payload: TPayload) => Promise<TResult>) {
  return async (payload: TPayload, ack?: Ack<TResult>): Promise<void> => {
    const response = await handler(payload).then(
      (data): AckResponse<TResult> => ({ data }),
      toAckError,
    );
    if (typeof ack === 'function') ack(response);
  };
}
