import type { AuditLogRecorder } from '@/domains/admin/audit-logs/audit-logs.module';
import type { AlbumsService } from '@/domains/catalog/albums/albums.service';
import { NotImplementedError } from '@/shared/errors/http-errors';
import type { Paginated } from '@/shared/utils/pagination';

import type { CardsRepository, CardView } from './cards.repository';
import type { CreateCardInput, ListCardsQuery, UpdateCardInput } from './cards.validator';

export interface CardsServiceDeps {
  cardsRepository: CardsRepository;
  albumsService: AlbumsService;
  auditLogs: AuditLogRecorder;
}

export class CardsService {
  constructor(private readonly deps: CardsServiceDeps) {}

  list(_query: ListCardsQuery): Promise<Paginated<CardView>> {
    throw new NotImplementedError();
  }

  findById(_id: string): Promise<CardView> {
    throw new NotImplementedError();
  }

  create(_input: CreateCardInput, _adminId: string): Promise<CardView> {
    throw new NotImplementedError();
  }

  update(_id: string, _input: UpdateCardInput, _adminId: string): Promise<CardView> {
    throw new NotImplementedError();
  }

  remove(_id: string, _adminId: string): Promise<void> {
    throw new NotImplementedError();
  }
}
