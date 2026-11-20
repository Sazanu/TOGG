import type { Collection, Expense } from './types';

/** The money counted at a service. Grouped into the columns of the weekly report. */
export const COLLECTION_LINES: { key: string; label: string; group: ReportGroup; sunday?: boolean }[] = [
  { key: 'offering', label: 'Offering (general)', group: 'offering' },
  { key: 'loveOffering', label: 'Love offering', group: 'offering', sunday: true },
  { key: 'kingdomOffering', label: 'Kingdom offering', group: 'offering', sunday: true },
  { key: 'seed', label: 'Seed', group: 'seed' },
  { key: 'specialSeed', label: 'Special seed', group: 'seed', sunday: true },
  { key: 'projectsOffering', label: 'Projects offering', group: 'projects', sunday: true },
  { key: 'tithe', label: 'Tithe', group: 'tithe', sunday: true },
  { key: 'pledges', label: 'Pledges', group: 'pledges', sunday: true },
];
export type ReportGroup = 'offering' | 'seed' | 'tithe' | 'projects' | 'pledges';
export const GROUP_LABEL: Record<ReportGroup, string> = { offering: 'Offering', seed: 'Seed', tithe: 'Tithe', projects: 'Projects', pledges: 'Pledges' };

/** `lines` (offerings the 30% is taken from) replaces the older group-based `basis` when set. */
export interface RemitSettings { rate: number; basis: ReportGroup[]; label: string; lines?: string[] }
export const DEFAULT_REMIT: RemitSettings = { rate: 30, basis: ['offering', 'seed'], label: '30%' };

export function groupTotals(c: Pick<Collection, 'lines'>): Record<ReportGroup, number> {
  const t: Record<ReportGroup, number> = { offering: 0, seed: 0, tithe: 0, projects: 0, pledges: 0 };
  COLLECTION_LINES.forEach((l) => { t[l.group] += Number(c.lines?.[l.key]) || 0; });
  return t;
}

export const lineLabel = (key?: string) => (key ? COLLECTION_LINES.find((l) => l.key === key)?.label ?? key : 'Not stated');

/** Offerings the 30% is taken from at this service. */
export function remitLines(c: Pick<Collection, 'remitLines'>, remit: RemitSettings): string[] {
  if (c.remitLines?.length) return c.remitLines;
  if (remit.lines?.length) return remit.lines;
  return COLLECTION_LINES.filter((l) => remit.basis.includes(l.group)).map((l) => l.key);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function summarize(c: Pick<Collection, 'lines' | 'expenses' | 'remitLines'>, remit: RemitSettings) {
  const g = groupTotals(c);
  const income = Object.values(g).reduce((a, b) => a + b, 0);
  const expenses = (c.expenses ?? []).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const basis = remitLines(c, remit).reduce((a, k) => a + (Number(c.lines?.[k]) || 0), 0);
  const remitAmount = r2(basis * (remit.rate / 100));
  return { ...g, income, expenses, basis, remit: remitAmount, balance: r2(income - expenses - remitAmount) };
}

export interface LineBalance { key: string; label: string; collected: number; remit: number; expenses: number; left: number }

/** For each offering: collected − its 30% − expenses taken from it = what is left. Old expenses with no source are listed as "Not stated". */
export function lineBalances(c: Pick<Collection, 'lines' | 'expenses' | 'remitLines'>, remit: RemitSettings, skip?: Expense): LineBalance[] {
  const rl = remitLines(c, remit);
  const spent = new Map<string, number>();
  (c.expenses ?? []).forEach((e) => { if (e === skip) return; const k = e.source || ''; spent.set(k, (spent.get(k) ?? 0) + (Number(e.amount) || 0)); });
  const out: LineBalance[] = COLLECTION_LINES.filter((l) => Number(c.lines?.[l.key]) || spent.get(l.key)).map((l) => {
    const collected = Number(c.lines?.[l.key]) || 0;
    const rm = rl.includes(l.key) ? r2(collected * remit.rate / 100) : 0;
    const ex = r2(spent.get(l.key) ?? 0);
    return { key: l.key, label: l.label, collected, remit: rm, expenses: ex, left: r2(collected - rm - ex) };
  });
  if (spent.get('')) out.push({ key: '', label: 'Not stated', collected: 0, remit: 0, expenses: r2(spent.get('')!), left: -r2(spent.get('')!) });
  return out;
}

/** Monday–Sunday week containing the date. */
export function weekOf(iso: string): { start: string; end: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // Monday = 0
  const s = new Date(y, m - 1, d - dow), e = new Date(y, m - 1, d - dow + 6);
  const f = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return { start: f(s), end: f(e) };
}
