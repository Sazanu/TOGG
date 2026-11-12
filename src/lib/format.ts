import type { GivingType, PaymentMethod } from './types';

export const CURRENCY = 'GH₵';

export function money(n: number): string {
  return `${CURRENCY}${(n || 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function moneyShort(n: number): string {
  return `${CURRENCY}${(n || 0).toLocaleString('en-GH', { maximumFractionDigits: 0 })}`;
}

/** Local date as YYYY-MM-DD. */
export function today(): string {
  return isoDate(new Date());
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function prettyDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function shortDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = isoDate(new Date(year, month, 1));
  const end = isoDate(new Date(year, month + 1, 0));
  return { start, end };
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const GIVING_TYPES: { value: GivingType; label: string }[] = [
  { value: 'tithe', label: 'Tithe' },
  { value: 'offering', label: 'Offering' },
  { value: 'thanksgiving', label: 'Thanksgiving' },
  { value: 'seed', label: 'Seed / First fruit' },
  { value: 'building', label: 'Building fund' },
  { value: 'missions', label: 'Missions' },
  { value: 'welfare', label: 'Welfare' },
  { value: 'pledge', label: 'Pledge redemption' },
  { value: 'other', label: 'Other' },
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'momo', label: 'Mobile Money' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'card', label: 'Card' },
];

export const SERVICE_TYPES = [
  'Sunday Service',
  'Midweek Service',
  'Prayer Meeting',
  'All-Night Service',
  'Bible Study',
  'Youth Service',
  'Children Service',
  'Special Program',
];

export function labelOf<T extends string>(list: { value: T; label: string }[], v: T): string {
  return list.find((x) => x.value === v)?.label ?? v;
}

export function initials(first: string, last: string): string {
  return `${(first || '?')[0] ?? ''}${(last || '')[0] ?? ''}`.toUpperCase();
}

export function ageFrom(dob: string): number | null {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
  return age;
}

export function monthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
}

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Fills {firstName}, {name}, {link}, {church}, {title}, {time} in an SMS template. */
export function fillTemplate(t: string, vars: Record<string, string>): string {
  return t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** SMS segments: 160 chars for one, 153 per part after that (GSM-7). */
export function smsParts(text: string): number {
  const n = text.length;
  return n <= 160 ? 1 : Math.ceil(n / 153);
}

export function fullName(m: { firstName: string; lastName: string }): string {
  return `${m.firstName} ${m.lastName}`.trim();
}
