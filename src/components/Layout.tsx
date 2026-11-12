import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Building2, CalendarCheck, ClipboardList, Database, HandCoins, Home, Inbox, LayoutDashboard, LogOut, Menu, MessageSquare, Network, ShieldCheck, Users, Wallet, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ALL, useData } from '../context/DataContext';
import { ROLE_LABELS, can, type Capability } from '../lib/roles';
import { Logo } from './Logo';
import { Avatar, cx } from './ui';

interface NavItem { to: string; label: string; icon: ReactNode; cap?: Capability; section: string }

const NAV: NavItem[] = [
  { section: '', to: '/', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  { section: 'People', to: '/members', label: 'Members', icon: <Users className="h-5 w-5" />, cap: 'members.read' },
  { section: 'People', to: '/registrations', label: 'Sign-ups', icon: <Inbox className="h-5 w-5" />, cap: 'registrations.manage' },
  { section: 'People', to: '/attendance', label: 'Attendance', icon: <CalendarCheck className="h-5 w-5" />, cap: 'attendance.write' },
  { section: 'Money', to: '/tithes', label: 'Tithes', icon: <Wallet className="h-5 w-5" />, cap: 'giving.read' },
  { section: 'Money', to: '/giving', label: 'Giving & offerings', icon: <HandCoins className="h-5 w-5" />, cap: 'giving.read' },
  { section: 'Ministry', to: '/departments', label: 'Departments', icon: <Network className="h-5 w-5" />, cap: 'departments.view' },
  { section: 'Ministry', to: '/reports', label: 'Dept. reports', icon: <ClipboardList className="h-5 w-5" />, cap: 'reports.view' },
  { section: 'Ministry', to: '/cells', label: 'Cells & growth', icon: <Home className="h-5 w-5" />, cap: 'cells.view' },
  { section: 'Ministry', to: '/messages', label: 'SMS messages', icon: <MessageSquare className="h-5 w-5" />, cap: 'sms.send' },
  { section: 'Admin', to: '/branches', label: 'Branches', icon: <Building2 className="h-5 w-5" />, cap: 'branches.manage' },
  { section: 'Admin', to: '/users', label: 'Users & roles', icon: <ShieldCheck className="h-5 w-5" />, cap: 'users.manage' },
  { section: 'Admin', to: '/database', label: 'Database', icon: <Database className="h-5 w-5" />, cap: 'data.manage' },
];

export function Layout() {
  const { profile, signOut } = useAuth();
  const { branches, scope, setScope, canSwitchScope, branchName } = useData();
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => !n.cap || can(profile?.role, n.cap));

  const sidebar = (
    <div className="flex h-full flex-col bg-royal-950 text-royal-100">
      <div className="flex items-center justify-between px-5 py-5">
        <Logo light />
        <button className="rounded-lg p-1 text-royal-300 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="px-4 pb-4">
        <div className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-royal-400">Branch</div>
        {canSwitchScope ? (
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="w-full rounded-xl border border-royal-700 bg-royal-900 px-3 py-2 text-sm text-white focus:border-gold-400 focus:outline-none"
          >
            <option value={ALL}>All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}{b.isHQ ? ' (HQ)' : ''}</option>
            ))}
          </select>
        ) : (
          <div className="rounded-xl border border-royal-800 bg-royal-900 px-3 py-2 text-sm text-white">{branchName(profile?.branchId)}</div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {items.map((n, i) => (
          <div key={n.to}>
          {n.section && n.section !== items[i - 1]?.section && (
            <div className="mb-1 mt-4 px-3 text-[11px] font-semibold uppercase tracking-wider text-royal-400">{n.section}</div>
          )}
          <NavLink
            to={n.to}
            end={n.to === '/'}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                isActive ? 'bg-gold-400 text-royal-950' : 'text-royal-200 hover:bg-royal-900 hover:text-white',
              )
            }
          >
            {n.icon}
            {n.label}
          </NavLink>
          </div>
        ))}
      </nav>

      <div className="border-t border-royal-900 p-4">
        <div className="flex items-center gap-3">
          <Avatar text={(profile?.displayName || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()} className="bg-gold-400 text-royal-950" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{profile?.displayName}</div>
            <div className="truncate text-xs text-royal-300">{profile ? ROLE_LABELS[profile.role] : ''}</div>
          </div>
          <button onClick={signOut} className="rounded-lg p-2 text-royal-300 hover:bg-royal-900 hover:text-white" title="Sign out" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-cream">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-royal-950/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-stone-200 bg-cream/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-royal-900" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <Logo />
          <span className="w-9" />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
