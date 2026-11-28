import type { Response } from 'express';

import type { PaginationMeta } from '@/shared/utils/pagination';

export function ok<T>(res: Response, data: T): void {
  res.status(200).json({ data });
}

export function created<T>(res: Response, data: T): void {
  res.status(201).json({ data });
}

export function accepted(res: Response): void {
  res.status(202).end();
}

export function noContent(res: Response): void {
  res.status(204).end();
}

export function paginated<T>(res: Response, data: T[], meta: PaginationMeta): void {
  res.status(200).json({ data, meta });
}

export function okWithMeta<T, M>(res: Response, data: T, meta: M): void {
  res.status(200).json({ data, meta });
}

export interface FileDownload {
  fileName: string;
  contentType: string;
  content: Buffer;
}

/** Arquivo privado mostrado na própria página (o print da denúncia), sem guardar em cache. */
export function inline(
  res: Response,
  { contentType, content }: Omit<FileDownload, 'fileName'>,
): void {
  res.status(200).type(contentType).set('Cache-Control', 'private, no-store').send(content);
}

export function download(res: Response, { fileName, contentType, content }: FileDownload): void {
  res.status(200).type(contentType).attachment(fileName).send(content);
}
