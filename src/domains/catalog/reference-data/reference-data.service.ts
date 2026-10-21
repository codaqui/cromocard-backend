import { NotImplementedError } from '@/shared/errors/http-errors';

import type {
  LanguageView,
  RarityView,
  ReferenceDataRepository,
} from './reference-data.repository';

export class ReferenceDataService {
  constructor(private readonly referenceDataRepository: ReferenceDataRepository) {}

  listRarities(): Promise<RarityView[]> {
    throw new NotImplementedError();
  }

  listLanguages(): Promise<LanguageView[]> {
    throw new NotImplementedError();
  }
}
