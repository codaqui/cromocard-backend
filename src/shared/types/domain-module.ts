import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { Router } from 'express';

export interface DomainModule {
  basePath: string;
  router: Router;
  registerDocs: (registry: OpenAPIRegistry) => void;
}
