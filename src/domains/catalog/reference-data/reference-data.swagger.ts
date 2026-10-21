import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

const tags = ['Catálogo - Dados de apoio'];

const referenceDataPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/reference-data/rarities',
    tags,
    summary: 'Lista as raridades, na ordem de sortOrder',
    responses: { 200: { description: 'Raridades' } },
  },
  {
    method: 'get',
    path: '/reference-data/languages',
    tags,
    summary: 'Lista os idiomas das cartas',
    responses: { 200: { description: 'Idiomas' } },
  },
];

export function registerReferenceDataDocs(registry: OpenAPIRegistry): void {
  referenceDataPaths.forEach((path) => registry.registerPath(path));
}
