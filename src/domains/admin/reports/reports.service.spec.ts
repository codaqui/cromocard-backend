import { describe, expect, it, vi } from 'vitest';

import type { ReportExporter, ReportTable } from './exporters/report-table';
import type { ReportArchiveEntry } from './report-exports.service';
import { ReportEmptyError } from './reports.errors';
import type { CatalogRow, ReportsRepository, SignupRow } from './reports.repository';
import { type ReportsAuditLog, ReportsService } from './reports.service';

const NOW = new Date('2026-11-16T15:00:00Z');
const ADMIN_ID = '0198f0c2-7a3b-7c1d-8e2f-1a2b3c4d5e6f';

const signups: SignupRow[] = [
  {
    name: 'Ana Lima',
    email: 'ana@cromocard.dev',
    role: 'CUSTOMER',
    createdAt: new Date('2026-11-11T13:00:00Z'),
  },
  {
    name: 'Bruno Sato',
    email: 'bruno@cromocard.dev',
    role: 'SELLER',
    createdAt: new Date('2026-11-10T13:00:00Z'),
  },
];

const catalog: CatalogRow[] = [
  {
    kind: 'CARD',
    name: 'Pikachu',
    number: '25',
    album: 'Kanto',
    franchise: 'Pokémon',
    createdAt: new Date('2026-11-12T13:00:00Z'),
  },
];

function fakeExporter(extension: string): ReportExporter & { tables: ReportTable[] } {
  const tables: ReportTable[] = [];
  return {
    tables,
    contentType: `application/${extension}`,
    extension,
    render: (table) => {
      tables.push(table);
      return Promise.resolve(Buffer.from(`arquivo ${extension}`));
    },
  };
}

function setup(rows = { signups, catalog }) {
  const findSignups = vi.fn((_range: unknown, limit?: number) =>
    Promise.resolve({ rows: rows.signups.slice(0, limit), total: rows.signups.length }),
  );
  const findCatalog = vi.fn(() =>
    Promise.resolve({ rows: rows.catalog, total: rows.catalog.length }),
  );
  const record = vi.fn(() => Promise.resolve());
  const archive = vi.fn((_entry: ReportArchiveEntry) => Promise.resolve());
  const repository: ReportsRepository = { findSignups, findCatalog };
  const auditLogService: ReportsAuditLog = { record };
  const exporters = { csv: fakeExporter('csv'), pdf: fakeExporter('pdf') };
  const service = new ReportsService({
    repository,
    auditLogService,
    archive: { archive },
    exporters,
    now: () => NOW,
  });
  return { service, findSignups, findCatalog, record, archive, exporters };
}

describe('ReportsService', () => {
  describe('preview', () => {
    it('CA1: novos cadastros de 30 dias mostra as primeiras linhas, as colunas e o total', async () => {
      const { service, findSignups } = setup();

      const preview = await service.preview('signups', { period: '30d', pageSize: 1 });

      expect(findSignups).toHaveBeenCalledWith(
        { from: new Date('2026-10-18T03:00:00Z'), to: NOW },
        1,
      );
      expect(preview).toMatchObject({ type: 'signups', title: 'Novos cadastros', total: 2 });
      expect(preview.rows).toEqual([signups[0]]);
      expect(preview.columns.map(({ label }) => label)).toEqual([
        'Nome',
        'E-mail',
        'Papel',
        'Cadastro',
      ]);
    });

    it('R6: usa o intervalo de datas informado e o relatório de catálogo', async () => {
      const { service, findCatalog } = setup();
      const range = { from: '2026-11-01T00:00:00-03:00', to: '2026-11-15T23:59:59-03:00' };

      const preview = await service.preview('catalog', { ...range, pageSize: 10 });

      expect(findCatalog).toHaveBeenCalledWith(
        { from: new Date(range.from), to: new Date(range.to) },
        10,
      );
      expect(preview).toMatchObject({ title: 'Catálogo', rows: catalog, total: 1 });
    });

    it('CA4: período sem dados devolve a prévia vazia, sem erro', async () => {
      const { service } = setup({ signups: [], catalog: [] });

      await expect(
        service.preview('signups', { period: 'today', pageSize: 10 }),
      ).resolves.toMatchObject({
        rows: [],
        total: 0,
      });
    });
  });

  describe('export', () => {
    it('CA2: exporta em CSV todas as linhas, com nome do arquivo e auditoria EXPORT_REPORT', async () => {
      const { service, findSignups, record, exporters } = setup();

      const file = await service.export({
        type: 'signups',
        query: { period: '7d', format: 'csv' },
        adminId: ADMIN_ID,
      });

      expect(findSignups).toHaveBeenCalledWith(expect.anything(), undefined);
      expect(file).toEqual({
        fileName: 'cromocard-signups-2026-11-10-2026-11-16.csv',
        contentType: 'application/csv',
        content: Buffer.from('arquivo csv'),
      });
      expect(exporters.csv.tables[0]?.rows).toEqual([
        ['Ana Lima', 'ana@cromocard.dev', 'Cliente', '11/11/2026'],
        ['Bruno Sato', 'bruno@cromocard.dev', 'Vendedor', '10/11/2026'],
      ]);
      expect(record).toHaveBeenCalledWith({
        adminId: ADMIN_ID,
        action: 'EXPORT_REPORT',
        entityType: 'report',
        details: {
          type: 'signups',
          format: 'csv',
          from: '2026-11-10T03:00:00.000Z',
          to: NOW.toISOString(),
          total: 2,
        },
      });
    });

    it('CCD107 CA1: guarda o arquivo exportado no histórico com os filtros usados', async () => {
      const { service, archive } = setup();

      const file = await service.export({
        type: 'signups',
        query: { period: '7d', format: 'csv' },
        adminId: ADMIN_ID,
      });

      expect(archive).toHaveBeenCalledWith({
        adminId: ADMIN_ID,
        type: 'signups',
        format: 'csv',
        filters: { period: '7d', from: '2026-11-10T03:00:00.000Z', to: NOW.toISOString() },
        file,
      });
    });

    it('CCD107: intervalo de datas fica sem período pronto nos filtros', async () => {
      const { service, archive } = setup();

      await service.export({
        type: 'catalog',
        query: { from: '2026-10-01T03:00:00Z', to: '2026-11-01T02:59:59Z', format: 'pdf' },
        adminId: ADMIN_ID,
      });

      expect(archive.mock.calls[0]?.[0].filters.period).toBeNull();
    });

    it('CA3: exporta em PDF com título, período e data de geração', async () => {
      const { service, exporters } = setup();

      const file = await service.export({
        type: 'catalog',
        query: { period: 'today', format: 'pdf' },
        adminId: ADMIN_ID,
      });

      expect(file.fileName).toBe('cromocard-catalog-2026-11-16-2026-11-16.pdf');
      expect(exporters.pdf.tables[0]).toEqual({
        title: 'Catálogo',
        periodLabel: '16/11/2026 a 16/11/2026',
        generatedAt: '16/11/2026 12:00',
        headers: ['Tipo', 'Nome', 'Número', 'Álbum', 'Franquia', 'Cadastro'],
        rows: [['Carta', 'Pikachu', '25', 'Kanto', 'Pokémon', '12/11/2026']],
      });
    });

    it('CA4/R12: sem dados no período, não gera arquivo nem grava auditoria', async () => {
      const { service, record, archive, exporters } = setup({ signups: [], catalog: [] });

      await expect(
        service.export({
          type: 'signups',
          query: { period: '30d', format: 'csv' },
          adminId: ADMIN_ID,
        }),
      ).rejects.toBeInstanceOf(ReportEmptyError);
      expect(exporters.csv.tables).toHaveLength(0);
      expect(record).not.toHaveBeenCalled();
      expect(archive).not.toHaveBeenCalled();
    });
  });
});
