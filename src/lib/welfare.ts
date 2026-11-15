import type { Gift, Member } from './types';
import { MONTHS } from './format';

/** Months from start (YYYY-MM) to now, inclusive. */
export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
    if (out.length > 120) break;
  }
  return out;
}

export const monthShort = (k: string) => `${MONTHS[Number(k.slice(5)) - 1].slice(0, 3)} ${k.slice(0, 4)}`;

/** Months each member has paid welfare for. Works for old records without forMonths too. */
export function paidMonths(gifts: Gift[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  gifts.filter((g) => g.type === 'welfare' && g.memberId).forEach((g) => {
    const set = out.get(g.memberId!) ?? new Set<string>();
    (g.forMonths?.length ? g.forMonths : [g.date.slice(0, 7)]).forEach((k) => set.add(k));
    out.set(g.memberId!, set);
  });
  return out;
}

export function expectedMonths(m: Member, startMonth: string, now: string): string[] {
  const from = m.joinedAt && m.joinedAt.slice(0, 7) > startMonth ? m.joinedAt.slice(0, 7) : startMonth;
  return monthsBetween(from, now);
}

export function welfareMembers(members: Member[]): Member[] {
  return members.filter((m) => m.status === 'active' && m.category === 'adult' && !m.welfareExempt);
}
