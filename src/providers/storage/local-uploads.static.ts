import path from 'node:path';

import express, { type RequestHandler, type Response } from 'express';

export const LOCAL_UPLOADS_PATH = '/uploads';

const allowCrossOriginEmbedding = (res: Response) =>
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

export function serveLocalUploads(rootDir: string): RequestHandler {
  return express.static(path.resolve(rootDir), { setHeaders: allowCrossOriginEmbedding });
}
