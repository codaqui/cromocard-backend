import type { OpenAPIRegistry, RouteConfig } from '@asteasolutions/zod-to-openapi';

import {
  addNoteSchema,
  approveSchema,
  listSellerVerificationsQuerySchema,
  rejectSchema,
} from './seller-verifications.validator';
import { sendPendingNoticeSchema } from './pending-notice.validator';

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
  {
    method: 'get',
    path: '/admin/seller-verifications/pending-templates',
    tags,
    security,
    summary: 'Lista os modelos de mensagem da pendência cadastral (seller.pending_templates)',
    responses: {
      200: { description: 'Modelos com key, title e body' },
      403: { description: 'Apenas administradores' },
    },
  },
  {
    method: 'post',
    path: '/admin/seller-verifications/{id}/pending-notice',
    tags,
    security,
    summary: 'Avisa o vendedor de uma pendência no cadastro, no site e por e-mail, com prazo',
    request: { body: { content: { 'application/json': { schema: sendPendingNoticeSchema } } } },
    responses: {
      200: { description: 'Pendência enviada; emailDelivered diz se o e-mail saiu' },
      400: { description: 'Mensagem vazia ou prazo inválido' },
      403: { description: 'Apenas administradores' },
      404: { description: 'Credenciamento não encontrado' },
      409: { description: 'Credenciamento já foi decidido' },
    },
  },
];

export function registerSellerVerificationsDocs(registry: OpenAPIRegistry): void {
  sellerVerificationsPaths.forEach((path) => registry.registerPath(path));
}
