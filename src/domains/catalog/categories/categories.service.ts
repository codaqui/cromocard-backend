import type { AuditLogRecorder } from '@/domains/admin/audit-logs/audit-logs.module';
import { NotImplementedError } from '@/shared/errors/http-errors';
import type { Paginated } from '@/shared/utils/pagination';

import type { CategoriesRepository, CategoryView } from './categories.repository';
import type {
  CreateCategoryInput,
  ListCategoriesQuery,
  MoveDirection,
  UpdateCategoryInput,
} from './categories.validator';

export class CategoriesService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly auditLogs: AuditLogRecorder,
  ) {}

  list(_query: ListCategoriesQuery): Promise<Paginated<CategoryView>> {
    throw new NotImplementedError();
  }

  findById(_id: string): Promise<CategoryView> {
    throw new NotImplementedError();
  }

  create(_input: CreateCategoryInput, _adminId: string): Promise<CategoryView> {
    throw new NotImplementedError();
  }

  update(_id: string, _input: UpdateCategoryInput, _adminId: string): Promise<CategoryView> {
    throw new NotImplementedError();
  }

  remove(_id: string, _adminId: string): Promise<void> {
    throw new NotImplementedError();
  }

  move(_id: string, _direction: MoveDirection, _adminId: string): Promise<CategoryView[]> {
    throw new NotImplementedError();
  }
}
