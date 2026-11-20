import type { Collection } from './types';

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

export interface RemitSettings { rate: number; basis: ReportGroup[]; label: string }
export const DEFAULT_REMIT: RemitSettings = { rate: 30, basis: ['offering', 'seed'], label: '30%' };

export function groupTotals(c: Pick<Collection, 'lines'>): Record<ReportGroup, number> {
  const t: Record<ReportGroup, number> = { offering: 0, seed: 0, tithe: 0, projects: 0, pledges: 0 };
  COLLECTION_LINES.forEach((l) => { t[l.group] += Number(c.lines?.[l.key]) || 0; });
  return t;
}

export function summarize(c: Pick<Collection, 'lines' | 'expenses'>, remit: RemitSettings) {
  const g = groupTotals(c);
  const income = Object.values(g).reduce((a, b) => a + b, 0);
  const expenses = (c.expenses ?? []).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const basis = remit.basis.reduce((a, k) => a + g[k], 0);
  const remitAmount = Math.round(basis * (remit.rate / 100) * 100) / 100;
  return { ...g, income, expenses, basis, remit: remitAmount, balance: Math.round((income - expenses - remitAmount) * 100) / 100 };
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
