import type { Role } from './roles';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  role: Role;
  /** Branch the user is limited to. null for head / associate pastor (all branches). */
  branchId: string | null;
  /** Departments a department leader looks after. */
  departmentIds: string[];
  active: boolean;
  createdAt?: unknown;
}

export interface Branch {
  id: string;
  name: string;
  location: string;
  pastorName: string;
  phone: string;
  isHQ: boolean;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  leaderName: string;
}

export type MemberCategory = 'adult' | 'teen' | 'child';
export type MemberStatus = 'active' | 'inactive' | 'visitor';

export interface Member {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  gender: 'male' | 'female' | '';
  dob: string; // YYYY-MM-DD
  category: MemberCategory;
  status: MemberStatus;
  branchId: string;
  departmentIds: string[];
  address: string;
  occupation: string;
  maritalStatus: string;
  joinedAt: string; // YYYY-MM-DD
  notes: string;
}

export interface Service {
  id: string;
  branchId: string;
  date: string; // YYYY-MM-DD
  type: string;
  title: string;
  count: number; // members checked in
  visitors: number; // head-count of visitors not in the system
}

export interface CheckIn {
  id: string; // = memberId
  memberId: string;
  name: string;
  category: MemberCategory;
  at: { toDate(): Date } | null;
}

export type GivingType =
  | 'tithe' | 'offering' | 'thanksgiving' | 'seed' | 'building' | 'missions' | 'welfare' | 'pledge' | 'other';
export type PaymentMethod = 'cash' | 'momo' | 'bank' | 'cheque' | 'card';

export interface Gift {
  id: string;
  branchId: string;
  date: string; // YYYY-MM-DD
  amount: number;
  type: GivingType;
  method: PaymentMethod;
  memberId: string | null;
  memberName: string;
  reference: string;
  note: string;
}

export interface Registration {
  id: string;
  kind: 'member' | 'visitor';
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  gender: string;
  category: MemberCategory;
  branchId: string;
  invitedBy: string;
  prayerRequest: string;
  status: 'new' | 'done';
  createdAt?: { toDate(): Date } | null;
}
