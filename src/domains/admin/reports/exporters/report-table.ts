export interface ReportTable {
  title: string;
  periodLabel: string;
  generatedAt: string;
  headers: string[];
  rows: string[][];
}

export interface ReportExporter {
  contentType: string;
  extension: string;
  render(table: ReportTable): Promise<Buffer>;
}
