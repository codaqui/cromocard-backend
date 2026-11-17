import { BRASILIA_TIME_ZONE } from '@/shared/utils/time-zone';

import type { ReportType } from './reports.validator';

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportDefinition {
  title: string;
  columns: ReportColumn[];
}

export const REPORT_DEFINITIONS: Record<ReportType, ReportDefinition> = {
  signups: {
    title: 'Novos cadastros',
    columns: [
      { key: 'name', label: 'Nome' },
      { key: 'email', label: 'E-mail' },
      { key: 'role', label: 'Papel' },
      { key: 'createdAt', label: 'Cadastro' },
    ],
  },
  catalog: {
    title: 'Catálogo',
    columns: [
      { key: 'kind', label: 'Tipo' },
      { key: 'name', label: 'Nome' },
      { key: 'number', label: 'Número' },
      { key: 'album', label: 'Álbum' },
      { key: 'franchise', label: 'Franquia' },
      { key: 'createdAt', label: 'Cadastro' },
    ],
  },
  'seller-audit': {
    title: 'Auditoria de Lojistas',
    columns: [
      { key: 'legalName', label: 'Loja' },
      { key: 'cnpj', label: 'CNPJ' },
      { key: 'email', label: 'E-mail' },
      { key: 'status', label: 'Status' },
      { key: 'createdAt', label: 'Cadastro' },
    ],
  },
};

const VALUE_LABELS: Record<string, string> = {
  CUSTOMER: 'Cliente',
  SELLER: 'Vendedor',
  ADMIN: 'Administrador',
  CARD: 'Carta',
  ALBUM: 'Álbum',
  UNDER_REVIEW: 'Em análise',
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Reprovado',
};

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BRASILIA_TIME_ZONE,
  dateStyle: 'short',
  timeStyle: 'short',
});

const isoDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: BRASILIA_TIME_ZONE });

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date).replace(',', '');
}

export function formatIsoDate(date: Date): string {
  return isoDateFormatter.format(date);
}

export type CellValue = string | number | Date | null | undefined;

export function formatCell(value: CellValue): string {
  if (value instanceof Date) return formatDate(value);
  if (value === null || value === undefined) return '';
  const text = String(value);
  return VALUE_LABELS[text] ?? text;
}
