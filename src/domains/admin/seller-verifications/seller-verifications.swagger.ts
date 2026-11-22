import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import {
  addNoteSchema,
  approveSchema,
  listSellerVerificationsQuerySchema,
  rejectSchema,
} from './seller-verifications.validator';

const tags = ['Credenciamento de Vendedores'];
const security = [{ bearerAuth: [] }];

const sellerVerificationsPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/admin/seller-verifications',
    tags,
    security,
    summary: 'Lista os credenciamentos de vendedores (administrador)',
    request: { query: listSellerVerificationsQuerySchema },
    responses: {
      200: { description: 'Lista paginada de credenciamentos' },
      403: { description: 'Apenas administradores' },
    },
  },
  {
    method: 'get',
    path: '/admin/seller-verifications/summary',
    tags,
    security,
    summary: 'Resumo de aprovados, pendentes e conversão no período',
    responses: {
      200: { description: 'Resumo do período' },
      403: { description: 'Apenas administradores' },
    },
  },
  {
    method: 'get',
    path: '/admin/seller-verifications/{id}',
    tags,
    security,
    summary: 'Dossiê do credenciamento, com documentos e notas internas',
    responses: {
      200: { description: 'Dossiê do credenciamento' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Credenciamento não encontrado' },
    },
  },
  {
    method: 'post',
    path: '/admin/seller-verifications/{id}/documents/{documentId}/validate',
    tags,
    security,
    summary: 'Marca um documento enviado como validado',
    responses: {
      200: { description: 'Documento validado' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Credenciamento ou documento não encontrado' },
    },
  },
  {
    method: 'post',
    path: '/admin/seller-verifications/{id}/notes',
    tags,
    security,
    summary: 'Registra uma anotação interna, invisível ao vendedor',
    request: { body: { content: { 'application/json': { schema: addNoteSchema } } } },
    responses: {
      201: { description: 'Anotação registrada' },
      400: { description: 'Dados inválidos' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Credenciamento não encontrado' },
    },
  },
  {
    method: 'post',
    path: '/admin/seller-verifications/{id}/approve',
    tags,
    security,
    summary: 'Aprova o credenciamento do vendedor',
    request: { body: { content: { 'application/json': { schema: approveSchema } } } },
    responses: {
      200: { description: 'Credenciamento aprovado' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Credenciamento não encontrado' },
      409: { description: 'Credenciamento já foi decidido' },
    },
  },
  {
    method: 'post',
    path: '/admin/seller-verifications/{id}/reject',
    tags,
    security,
    summary: 'Rejeita o credenciamento do vendedor, com motivo obrigatório',
    request: { body: { content: { 'application/json': { schema: rejectSchema } } } },
    responses: {
      200: { description: 'Credenciamento rejeitado' },
      400: { description: 'Motivo obrigatório' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Credenciamento não encontrado' },
      409: { description: 'Credenciamento já foi decidido' },
    },
  },
];

export function registerSellerVerificationsDocs(registry: OpenAPIRegistry): void {
  sellerVerificationsPaths.forEach((path) => registry.registerPath(path));
}
