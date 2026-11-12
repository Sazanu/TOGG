import { useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { readSheet, type Sheet } from '../lib/csv';
import { Button, Modal, Select, errorText } from './ui';

export interface ImportField {
  key: string;
  label: string;
  required?: boolean;
  /** Lower-case header names that should auto-map to this field. */
  aliases: string[];
}

export interface ImportResult { added: number; skipped: number; notes?: string[] }

interface Props {
  title: string;
  fields: ImportField[];
  /** Extra options shown on the mapping step (e.g. which branch). */
  options?: ReactNode;
  help?: ReactNode;
  onImport: (rows: Record<string, string>[]) => Promise<ImportResult>;
  onClose: () => void;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function ImportWizard({ title, fields, options, help, onImport, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fileName, setFileName] = useState('');
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  async function pick(file: File) {
    setError('');
    try {
      const s = await readSheet(file);
      if (!s.rows.length) { setError('That file has no rows.'); return; }
      const auto: Record<string, string> = {};
      for (const f of fields) {
        const want = [f.key, f.label, ...f.aliases].map(norm);
        const hit = s.headers.find((h) => want.includes(norm(h)));
        if (hit) auto[f.key] = hit;
      }
      setMap(auto);
      setSheet(s);
      setFileName(file.name);
    } catch (e) {
      setError(`Could not read that file: ${errorText(e)}`);
    }
  }

  const mapped = (sheet?.rows ?? []).map((r) => {
    const o: Record<string, string> = {};
    for (const f of fields) o[f.key] = map[f.key] ? r[map[f.key]] ?? '' : '';
    return o;
  });
  const missing = fields.filter((f) => f.required && !map[f.key]);

  async function run() {
    setBusy(true); setError('');
    try { setResult(await onImport(mapped)); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} title={title} wide>
      {result ? (
        <div className="py-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <h3 className="mt-3 font-display text-xl font-bold text-royal-950">{result.added} imported</h3>
          {result.skipped > 0 && <p className="mt-1 text-sm text-stone-500">{result.skipped} skipped (duplicates or missing details)</p>}
          {result.notes && result.notes.length > 0 && (
            <ul className="mx-auto mt-3 max-h-40 max-w-md overflow-y-auto text-left text-xs text-stone-500">
              {result.notes.slice(0, 50).map((n, i) => <li key={i}>• {n}</li>)}
            </ul>
          )}
          <Button className="mt-6" onClick={onClose}>Done</Button>
        </div>
      ) : !sheet ? (
        <div>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-royal-200 bg-royal-50/40 px-6 py-12 text-center hover:border-royal-400"
          >
            <FileSpreadsheet className="h-10 w-10 text-royal-500" />
            <span className="mt-3 font-medium text-royal-900">Choose an Excel or CSV file</span>
            <span className="mt-1 text-sm text-stone-500">.xlsx, .xls or .csv — the first row should be the column names</span>
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
          {help && <div className="mt-4 rounded-xl bg-stone-50 p-4 text-sm text-stone-600">{help}</div>}
          {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3 text-sm">
            <span><b>{fileName}</b> · {sheet.rows.length} rows</span>
            <button className="text-royal-700 hover:underline" onClick={() => setSheet(null)}>Choose another file</button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-stone-800">Match your columns</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-sm text-stone-600">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
                  <Select value={map[f.key] ?? ''} onChange={(e) => setMap({ ...map, [f.key]: e.target.value })} className="!py-2">
                    <option value="">— not in file —</option>
                    {sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </Select>
                </label>
              ))}
            </div>
          </div>

          {options}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-stone-800">Preview (first 5 rows)</h3>
            <div className="overflow-x-auto rounded-xl border border-stone-200">
              <table className="w-full text-xs">
                <thead className="bg-stone-50 text-left text-stone-500">
                  <tr>{fields.filter((f) => map[f.key]).map((f) => <th key={f.key} className="px-3 py-2 font-medium">{f.label}</th>)}</tr>
                </thead>
                <tbody>
                  {mapped.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-stone-100">
                      {fields.filter((f) => map[f.key]).map((f) => <td key={f.key} className="whitespace-nowrap px-3 py-2 text-stone-700">{r[f.key]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {missing.length > 0 && <p className="text-sm text-amber-700">Please match: {missing.map((f) => f.label).join(', ')}</p>}

          <div className="flex justify-end gap-2 border-t border-stone-100 pt-4">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={run} loading={busy} disabled={missing.length > 0}><Upload className="h-4 w-4" /> Import {sheet.rows.length} rows</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
