import * as XLSX from 'xlsx';
import { isoDate } from './format';

export type Row = Record<string, unknown>;

/** Download rows as a real Excel workbook (one sheet per entry). */
export function downloadExcel(filename: string, sheets: { name: string; rows: Row[] }[]): void {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ '(empty)': '' }]);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Back-compat helper: single-sheet export. */
export function downloadCsv(filename: string, rows: Row[]): void {
  downloadExcel(filename.replace(/\.csv$/, '.xlsx'), [{ name: 'Sheet1', rows }]);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export interface Sheet { headers: string[]; rows: Record<string, string>[] }

/** Reads .xlsx, .xls or .csv. Every cell comes back as a trimmed string; dates as YYYY-MM-DD. */
export async function readSheet(file: File): Promise<Sheet> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: true });
  const headers = raw.length ? Object.keys(raw[0]) : [];
  const rows = raw.map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) {
      const v = r[h];
      out[h] = v instanceof Date ? isoDate(v) : String(v ?? '').trim();
    }
    return out;
  }).filter((r) => Object.values(r).some((v) => v !== ''));
  return { headers, rows };
}

/** Accepts 2024-03-05, 05/03/2024 (day first, as used in Ghana), 5-Mar-2024, Excel serials. */
export function parseDateLoose(v: string): string {
  const s = (v || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    return isoDate(new Date(y, m - 1, d));
  }
  const dmY = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmY) {
    let y = Number(dmY[3]);
    if (y < 100) y += y > 40 ? 1900 : 2000;
    let d = Number(dmY[1]); let m = Number(dmY[2]);
    if (m > 12 && d <= 12) [d, m] = [m, d]; // clearly month-first
    return isoDate(new Date(y, m - 1, d));
  }
  if (/^\d{5}$/.test(s)) { // Excel serial date
    const dt = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
    return isoDate(new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? '' : isoDate(new Date(t));
}

/** Ghana numbers to a comparable local form: 0241234567. */
export function normalizePhone(v: string): string {
  let d = (v || '').replace(/\D/g, '');
  if (d.startsWith('233')) d = '0' + d.slice(3);
  if (d.length === 9) d = '0' + d;
  return d;
}

export function parseAmount(v: string): number {
  const n = Number(String(v || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
