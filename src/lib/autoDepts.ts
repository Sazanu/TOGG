import type { Department, Member } from './types';

/** Adult members go into Golden Heart (unmarried) or Diamond Heart (married) automatically. */
export function autoGroupFor(m: Pick<Member, 'maritalStatus' | 'category'>): 'single' | 'married' | null {
  if (m.category !== 'adult') return null;
  const s = (m.maritalStatus || '').toLowerCase();
  if (!s) return null;
  return s === 'married' ? 'married' : 'single';
}

/** Returns the member's departments with the automatic ones corrected. */
export function withAutoDepts(m: Pick<Member, 'maritalStatus' | 'category' | 'departmentIds'>, departments: Department[]): string[] {
  const auto = departments.filter((d) => d.autoRule === 'single' || d.autoRule === 'married');
  if (!auto.length) return m.departmentIds ?? [];
  const want = autoGroupFor(m);
  const keep = (m.departmentIds ?? []).filter((id) => !auto.some((d) => d.id === id));
  if (!want) return [...keep, ...(m.departmentIds ?? []).filter((id) => auto.some((d) => d.id === id))];
  return [...keep, ...auto.filter((d) => d.autoRule === want).map((d) => d.id)];
}
