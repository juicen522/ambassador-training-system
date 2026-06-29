import * as XLSX from 'xlsx';

export type ExcelSheet = {
  name: string;
  rows: (string | number | null | undefined)[][];
};

export function excelFilename(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${prefix}_${stamp}.xlsx`;
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31) || 'Sheet1';
}

export function downloadExcel(filename: string, sheets: ExcelSheet[]): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheet.name));
  }
  const out = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, out);
}

export function downloadExcelSheet(
  filename: string,
  sheetName: string,
  rows: (string | number | null | undefined)[][],
): void {
  downloadExcel(filename, [{ name: sheetName, rows }]);
}
