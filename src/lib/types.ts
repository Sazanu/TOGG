import type { Area, PrayerLevel, Role } from './roles';

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  phone?: string;
  role: Role;
  /** Branch the user is limited to. null for head / associate pastor (all branches). */
  branchId: string | null;
  /** Departments a department head looks after. */
  departmentIds: string[];
  /** Cells a cell leader looks after. */
  cellIds?: string[];
  /** Areas the Super Admin has switched off for this person. */
  revoked?: Area[];
  /** Extra areas given on top of the role (own branch). */
  granted?: Area[];
  /** The member record of this person: their offices (department head, cell leader…) give them access automatically. */
  memberId?: string;
  /** Departments / cells given by the offices they hold (kept in step by the Leadership page). */
  officeDepartmentIds?: string[];
  officeCellIds?: string[];
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
  /** 'online' = members who live abroad / travel, connected through an online group. */
  kind?: 'physical' | 'online';
  groupLink?: string;
}

export interface Department {
  id: string;
  name: string;
  description: string;
  /** null = main department; otherwise the id of its parent department. */
  parentId: string | null;
  headName: string;
  headPhone: string;
  assistantName: string;
  /** Golden Heart (single) / Diamond Heart (married): members are added automatically. */
  autoRule?: 'single' | 'married' | null;
  /** 'charity' marks the Charity Foundation, which gets its own module. */
  kind?: 'charity' | null;
  headMemberId?: string;
  assistantMemberId?: string;
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
  membershipNo?: string;
  cellId?: string | null;
  /** How they came in: manual, import, registration, cell, checkin */
  source?: string;
  /** Not expected to pay monthly welfare dues. */
  welfareExempt?: boolean;
  /** Rev., Mrs., Ps., Elder… (kept apart so SMS can still say "Dear Benjamin"). */
  title?: string;
  /** Church positions held, e.g. Head Pastor, Associate Pastor, Elder (one person can hold several). */
  positions?: string[];
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
  | 'tithe' | 'offering' | 'thanksgiving' | 'seed' | 'building' | 'missions' | 'welfare' | 'pledge' | 'project' | 'other';
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
  /** For type 'project': which project the money is for. */
  projectId?: string | null;
  /** For type 'welfare': the month(s) the dues cover, YYYY-MM. */
  forMonths?: string[];
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

export interface Cell {
  id: string;
  name: string;
  branchId: string;
  /** Cells stand on their own; kept only for cells created by older versions. */
  departmentId?: string;
  leaderName: string;
  leaderPhone: string;
  leaderMemberId?: string;
  location: string;
  meetingDay: string;
  meetingTime: string;
  active: boolean;
}

export interface NewContact { name: string; phone: string; addedAsMember?: boolean }

export interface CellReport {
  id: string;
  cellId: string;
  branchId: string;
  departmentId?: string;
  date: string;
  topic: string;
  membersPresent: number;
  firstTimers: number;
  newConverts: number;
  offering: number;
  testimonies: string;
  challenges: string;
  newContacts: NewContact[];
  submittedByName: string;
}

export type DeptReportType = 'report' | 'budget' | 'plan';
export type DeptReportStatus = 'draft' | 'submitted' | 'approved' | 'returned';

export interface BudgetLine { item: string; amount: number }
export interface PlannedActivity { date: string; title: string; details: string; cost: number }

export interface DeptReport {
  id: string;
  departmentId: string;
  branchId: string;
  month: string; // YYYY-MM
  type: DeptReportType;
  status: DeptReportStatus;
  // monthly report
  summary: string;
  achievements: string;
  challenges: string;
  membersActive: number;
  newMembers: number;
  recommendations: string;
  // budget
  lines: BudgetLine[];
  // plan
  activities: PlannedActivity[];
  submittedByName: string;
  reviewComment: string;
  reviewedByName: string;
  updatedAt?: { toDate(): Date } | null;
}

export type AudienceType = 'all' | 'branch' | 'department' | 'cell' | 'category' | 'absentees' | 'custom' | 'members' | 'welfare_defaulters';

export interface Audience {
  type: AudienceType;
  branchId?: string | null;
  departmentId?: string;
  cellId?: string;
  category?: MemberCategory;
  serviceId?: string;
  phones?: string[];
  memberIds?: string[];
  includeVisitors?: boolean;
}

export interface SmsMessage {
  id: string;
  branchId: string | null;
  message: string;
  audience: Audience;
  kind: 'instant' | 'scheduled' | 'automated';
  label: string;
  status: 'queued' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
  sendAt?: { toDate(): Date; toMillis(): number } | null;
  recipientsCount?: number;
  sentCount?: number;
  failedCount?: number;
  error?: string;
  /** What the SMS company answered (shown so you can confirm delivery). */
  providerResponse?: string;
  createdByName?: string;
  createdAt?: { toDate(): Date } | null;
}

export interface Programme {
  id: string;
  branchId: string | null;
  title: string;
  link: string;
  message: string;
  days: number[]; // 0 = Sunday
  time: string; // HH:MM, Ghana time
  remindMinutesBefore: number;
  audience: Audience;
  active: boolean;
  lastSentOn?: string;
}

export interface SmsSettings {
  /** Sender IDs Gonlinesites has approved (others are refused with error 106). */
  approvedSenders?: string[];
  provider: 'gonlinesites' | 'arkesel' | 'hubtel' | 'mnotify' | 'log';
  /** Web-app URL of the free Google Apps Script SMS server (sms-server/). */
  relayUrl?: string;
  senderId: string;
  absenteeEnabled: boolean;
  absenteeTemplate: string;
  absenteeServiceTypes: string[];
  absenteeHour: number; // 0-23, Ghana time, day of the service
  birthdayEnabled: boolean;
  birthdayTemplate: string;
  churchName: string;
}

export interface PrayerRequest {
  id: string;
  kind: 'prayer' | 'testimony';
  name: string;
  phone: string;
  phoneKey: string;
  branchId: string;
  toLevel: PrayerLevel;
  departmentId: string;
  cellId: string;
  text: string;
  mediaPath: string;
  /** Set when the recording is kept on Cloudinary (free) instead of Firebase Storage. */
  mediaUrl?: string;
  mediaType: '' | 'audio' | 'video';
  confidential: boolean;
  status: 'new' | 'praying' | 'answered';
  answerNote: string;
  memberId: string;
  createdAt?: { toDate(): Date } | null;
}

export interface Milestone { title: string; done: boolean; doneOn: string }
export interface ProgressUpdate { date: string; text: string; percent: number }

export interface Project {
  id: string;
  title: string;
  description: string;
  goal: number;
  raised: number;
  donors: number;
  progress: number; // % of the physical work done
  milestones: Milestone[];
  updates: ProgressUpdate[];
  status: 'active' | 'completed' | 'paused';
  public: boolean;
  startDate: string;
  targetDate: string;
}

export type CharityType = 'beneficiary' | 'aid' | 'support' | 'outreach';
export interface CharityEntry {
  id: string;
  type: CharityType;
  date: string;
  // beneficiary
  name: string;
  phone: string;
  need: string;
  category: string;
  status: 'waiting' | 'helped' | 'closed';
  // aid given / support received
  beneficiaryId: string;
  form: 'cash' | 'items';
  amount: number;
  items: string;
  donor: string;
  // outreach
  place: string;
  peopleReached: number;
  notes: string;
}

export type Assessment = 'good' | 'fair' | 'needs_improvement';
export interface PastorNote {
  id: string;
  memberId: string;
  memberName: string;
  area: string;
  rating: Assessment | null;
  note: string;
  remindOn: string; // YYYY-MM-DD or ''
  done: boolean;
  createdAt?: { toDate(): Date } | null;
}

export interface PaymentSettings {
  momoNumber: string;
  momoName: string;
  momoNetwork: string;
  paymentLink: string;
  /** Paystack PUBLIC key (pk_live_… or pk_test_…). The secret key is stored separately and never shown. */
  paystackPublicKey?: string;
  bankDetails: string;
  publicSiteUrl: string;
}

export interface WelfareSettings {
  amount: number;
  startMonth: string; // YYYY-MM
  remindEnabled: boolean;
  remindDay: number; // day of month
  template: string;
}

/** Money counted at one church service (a collection — not individual giving). */
export interface Collection {
  id: string;
  branchId: string;
  date: string;
  serviceType: string;
  title: string;
  lines: Record<string, number>;
  expenses: Expense[];
  /** Offerings (line keys) the 30% is taken from at this service; empty/missing = the default in settings. */
  remitLines?: string[];
  countedBy: string;
  notes: string;
}

/** Money spent out of a service collection. `source` is the offering it was taken from (a collection line key). */
export interface Expense {
  item: string;
  amount: number;
  source?: string;
  details?: string;
  paidTo?: string;
  approvedBy?: string;
  date?: string;
}

/** Status on the cell leaders' log book: Church Member, Unestablished Convert, Established Convert. */
export type CellPersonStatus = 'CM' | 'UCV' | 'ECV';
export interface CellLogRow {
  memberId: string;
  name: string;
  phone: string;
  status: CellPersonStatus;
  cell: boolean[];    // weeks 1-5
  sunday: boolean[];  // weeks 1-5
  weekday: boolean[]; // weeks 1-5
}
export interface CellMeetingWeek { date: string; attendance: number; offering: number }
/** One month of the cell leaders' log book (TOGG paper form). id = {cellId}_{YYYY-MM} */
export interface CellLog {
  id: string;
  cellId: string;
  branchId: string;
  month: string;
  leaderName: string;
  rows: CellLogRow[];
  meetings: CellMeetingWeek[]; // WK1-WK5
  updatedByName?: string;
}

/** A personal reminder: shown in the bell (with a sound) for the person who set it. */
export interface Reminder {
  id: string;
  ownerUid: string;
  title: string;
  note: string;
  remindAt: string; // YYYY-MM-DDTHH:mm (Ghana time)
  link: string;
  done: boolean;
}

export type OnlinePurpose = 'tithe' | 'offering' | 'thanksgiving' | 'seed' | 'project' | 'welfare' | 'charity' | 'building' | 'missions';
/** A Paystack payment started on the public Give page. id = Paystack reference. Confirmed only by the server. */
export interface OnlineGift {
  id: string;
  purpose: OnlinePurpose;
  projectId: string;
  branchId: string;
  name: string;
  phone: string;
  phoneKey: string;
  email: string;
  amount: number;
  currency: 'GHS';
  status: 'pending' | 'success' | 'failed' | 'abandoned';
  channel?: string;
  givingId?: string;
  error?: string;
  createdAt?: { toDate(): Date } | null;
}
