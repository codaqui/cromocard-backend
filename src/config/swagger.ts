import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';

import type { DomainModule } from '@/shared/types/domain-module';

export function buildOpenApiDocument(modules: DomainModule[]) {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });
  modules.forEach((module) => module.registerDocs(registry));

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: { title: 'CromoCard API', version: '0.1.0' },
    servers: [{ url: '/api/v1' }],
  });
}
