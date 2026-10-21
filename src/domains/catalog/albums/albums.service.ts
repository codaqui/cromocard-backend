import type { AuditLogRecorder } from '@/domains/admin/audit-logs/audit-logs.module';
import { NotImplementedError } from '@/shared/errors/http-errors';
import type { Paginated } from '@/shared/utils/pagination';

import type { AlbumsRepository, AlbumView } from './albums.repository';
import type { CreateAlbumInput, ListAlbumsQuery, UpdateAlbumInput } from './albums.validator';

export class AlbumsService {
  constructor(
    private readonly albumsRepository: AlbumsRepository,
    private readonly auditLogs: AuditLogRecorder,
  ) {}

  list(_query: ListAlbumsQuery): Promise<Paginated<AlbumView>> {
    throw new NotImplementedError();
  }

  findById(_id: string): Promise<AlbumView> {
    throw new NotImplementedError();
  }

  create(_input: CreateAlbumInput, _adminId: string): Promise<AlbumView> {
    throw new NotImplementedError();
  }

  update(_id: string, _input: UpdateAlbumInput, _adminId: string): Promise<AlbumView> {
    throw new NotImplementedError();
  }

  remove(_id: string, _adminId: string): Promise<void> {
    throw new NotImplementedError();
  }
}
