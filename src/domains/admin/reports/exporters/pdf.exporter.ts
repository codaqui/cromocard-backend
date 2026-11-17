import PDFDocument from 'pdfkit';

import type { ReportExporter, ReportTable } from './report-table';

type Document = PDFKit.PDFDocument;

const MARGIN = 40;
const ROW_HEIGHT = 18;
const FONT_SIZE = { title: 18, info: 10, table: 9 };

function writeHeader(doc: Document, { title, periodLabel, generatedAt }: ReportTable): void {
  doc.font('Helvetica-Bold').fontSize(FONT_SIZE.title).text(`CromoCard · ${title}`);
  doc.moveDown(0.3).font('Helvetica').fontSize(FONT_SIZE.info);
  doc.text(`Período: ${periodLabel}`).text(`Gerado em: ${generatedAt}`).moveDown();
}

function writeRow(doc: Document, cells: string[], isHeader: boolean): void {
  const width = (doc.page.width - MARGIN * 2) / cells.length;
  if (doc.y + ROW_HEIGHT > doc.page.height - MARGIN) doc.addPage();
  const top = doc.y;
  doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(FONT_SIZE.table);
  cells.forEach((cell, index) => {
    doc.text(cell, MARGIN + index * width, top, {
      width: width - 4,
      height: ROW_HEIGHT,
      ellipsis: true,
    });
  });
  doc.x = MARGIN;
  doc.y = top + ROW_HEIGHT;
}

function collect(doc: Document): Promise<Buffer> {
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function renderPdf(table: ReportTable, compress: boolean): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN, compress });
  const file = collect(doc);
  writeHeader(doc, table);
  writeRow(doc, table.headers, true);
  table.rows.forEach((row) => writeRow(doc, row, false));
  doc.end();
  return file;
}

export function createPdfExporter(compress = true): ReportExporter {
  return {
    contentType: 'application/pdf',
    extension: 'pdf',
    render: (table) => renderPdf(table, compress),
  };
}

export const pdfExporter = createPdfExporter();
