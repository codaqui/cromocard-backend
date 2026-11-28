import { randomUUID } from 'node:crypto';

import { detectImageType } from '@/domains/uploads/uploads.module';
import type { StorageProvider } from '@/providers/storage/storage.provider';

import { InvalidEvidenceTypeError } from './contact-moderation.errors';
import type { EvidenceStorage } from './contact-moderation.service';

export const EVIDENCES_FOLDER = 'report-evidences';

/**
 * Os prints mostram uma conversa privada: vão para o storage privado (ADR-068, ADR-073), que nunca é servido
 * por `/uploads`. O banco guarda a chave, e só o admin lê o arquivo, pela rota da Fila de moderação.
 */
export const createEvidenceStorage = (privateStorage: StorageProvider): EvidenceStorage => ({
  isImage: (content) => detectImageType(content) !== undefined,
  upload: async (content) => {
    const imageType = detectImageType(content);
    if (!imageType) throw new InvalidEvidenceTypeError();
    const key = `${EVIDENCES_FOLDER}/${randomUUID()}.${imageType.extension}`;
    const stored = await privateStorage.upload({ key, content, contentType: imageType.mimeType });
    return stored.key;
  },
  remove: (key) => privateStorage.delete(key),
});
