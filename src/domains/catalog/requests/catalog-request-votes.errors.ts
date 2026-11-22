import { ConflictError } from '@/shared/errors/http-errors';

export class VotingClosedError extends ConflictError {
  constructor() {
    super('A votação desta sugestão foi encerrada', 'VOTING_CLOSED');
  }
}
