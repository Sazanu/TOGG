import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { IdleLogout } from './components/IdleLogout';
import { Spinner, ToastProvider } from './components/ui';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider, useData } from './context/DataContext';
import { firebaseConfigured } from './lib/firebase';
import { can, isGlobal, type Capability } from './lib/roles';
import Login from './pages/Login';
import NotConfigured from './pages/NotConfigured';
import Pending from './pages/Pending';
import { useCanCharity } from './pages/Charity';

const Attendance = lazy(() => import('./pages/Attendance'));
const Branches = lazy(() => import('./pages/Branches'));
const CheckIn = lazy(() => import('./pages/CheckIn'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Departments = lazy(() => import('./pages/Departments'));
const Giving = lazy(() => import('./pages/Giving'));
const Members = lazy(() => import('./pages/Members'));
const PublicForm = lazy(() => import('./pages/PublicForm'));
const Registrations = lazy(() => import('./pages/Registrations'));
const Users = lazy(() => import('./pages/Users'));
const Tithes = lazy(() => import('./pages/Tithes'));
const Reports = lazy(() => import('./pages/Reports'));
const ReportEditor = lazy(() => import('./pages/Reports').then((x) => ({ default: x.ReportEditor })));
const DepartmentDetail = lazy(() => import('./pages/DepartmentDetail'));
const Cells = lazy(() => import('./pages/Cells'));
const CellDetail = lazy(() => import('./pages/CellDetail'));
const Messages = lazy(() => import('./pages/Messages'));
const Database = lazy(() => import('./pages/Database'));
const MemberProfile = lazy(() => import('./pages/MemberProfile'));
const Prayer = lazy(() => import('./pages/Prayer'));
const PublicPrayer = lazy(() => import('./pages/PublicPrayer'));
const Welfare = lazy(() => import('./pages/Welfare'));
const Projects = lazy(() => import('./pages/Projects'));
const ProjectDetail = lazy(() => import('./pages/Projects').then((x) => ({ default: x.ProjectDetail })));
const PublicProject = lazy(() => import('./pages/Projects').then((x) => ({ default: x.PublicProject })));
const Charity = lazy(() => import('./pages/Charity'));
const PublicCharity = lazy(() => import('./pages/Charity').then((x) => ({ default: x.PublicCharity })));
const Settings = lazy(() => import('./pages/Settings'));
const PublicPay = lazy(() => import('./pages/PublicPay'));
const Status = lazy(() => import('./pages/Status'));
const ServiceFinance = lazy(() => import('./pages/ServiceFinance'));
const CollectionDetail = lazy(() => import('./pages/ServiceFinance').then((x) => ({ default: x.CollectionDetail })));
const Expenses = lazy(() => import('./pages/Expenses'));
const Leadership = lazy(() => import('./pages/Leadership'));
const Station = lazy(() => import('./pages/Station'));
const PublicHere = lazy(() => import('./pages/PublicHere'));

/** Unknown address inside the app: say so, and offer a way back (never a dead end). */
function NotFound() {
  const back = () => { if (((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0 || window.history.length > 1) window.history.back(); else window.location.assign('/'); };
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <div className="font-display text-6xl font-extrabold text-royal-200">404</div>
      <h1 className="mt-2 font-display text-xl font-bold text-royal-950">Page not found</h1>
      <p className="mt-1 text-sm text-stone-500">This address does not exist, or you do not have access to it.</p>
      <div className="mt-6 flex justify-center gap-2">
        <button onClick={back} className="rounded-xl border border-stone-300 px-4 py-2 text-sm">← Back</button>
        <a href="/" className="rounded-xl bg-royal-800 px-4 py-2 text-sm font-semibold text-white">Dashboard</a>
      </div>
    </div>
  );
}

function CharityGuard({ children }: { children: ReactNode }) {
  const ok = useCanCharity();
  const { profile } = useAuth();
  const { departments } = useData();
  // Wait for the department list before deciding (charity leaders get access through their department).
  if (!ok && profile && !isGlobal(profile.role) && (profile.departmentIds ?? []).length && departments.length === 0) return <Spinner />;
  return ok ? <>{children}</> : <Navigate to="/" replace />;
}

function Guard({ cap, children }: { cap: Capability; children: ReactNode }) {
  const { profile } = useAuth();
  return can(profile?.role, cap) ? <>{children}</> : <Navigate to="/" replace />;
}

function Private() {
  const { user, profile, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-cream"><Spinner /></div>;
  if (!user) return <Login />;
  const ready = profile && profile.active && profile.role !== 'pending' && (isGlobal(profile.role) || profile.branchId);
  if (!ready) return <Pending />;
  return (
    <DataProvider>
      <Suspense fallback={<div className="min-h-screen bg-cream"><Spinner /></div>}>
      <Routes>
        <Route path="station/:serviceId" element={<Guard cap="attendance.write"><Station /></Guard>} />
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="members" element={<Guard cap="members.list"><Members /></Guard>} />
          <Route path="members/:id" element={<Guard cap="members.read"><MemberProfile /></Guard>} />
          <Route path="prayer-requests" element={<Guard cap="prayer.view"><Prayer /></Guard>} />
          <Route path="welfare" element={<Guard cap="giving.read"><Welfare /></Guard>} />
          <Route path="projects" element={<Guard cap="giving.read"><Projects /></Guard>} />
          <Route path="projects/:id" element={<Guard cap="giving.read"><ProjectDetail /></Guard>} />
          <Route path="charity" element={<CharityGuard><Charity /></CharityGuard>} />
          <Route path="settings" element={<Guard cap="data.manage"><Settings /></Guard>} />
          <Route path="leadership" element={<Guard cap="members.list"><Leadership /></Guard>} />
          <Route path="service-finance" element={<Guard cap="giving.read"><ServiceFinance /></Guard>} />
          <Route path="service-finance/:id" element={<Guard cap="giving.read"><CollectionDetail /></Guard>} />
          <Route path="expenses" element={<Guard cap="giving.read"><Expenses /></Guard>} />
          <Route path="status" element={<Guard cap="data.manage"><Status /></Guard>} />
          <Route path="attendance" element={<Guard cap="attendance.write"><Attendance /></Guard>} />
          <Route path="attendance/:serviceId" element={<Guard cap="attendance.write"><CheckIn /></Guard>} />
          <Route path="giving" element={<Guard cap="giving.read"><Giving /></Guard>} />
          <Route path="registrations" element={<Guard cap="registrations.manage"><Registrations /></Guard>} />
          <Route path="branches" element={<Guard cap="branches.manage"><Branches /></Guard>} />
          <Route path="departments" element={<Guard cap="departments.view"><Departments /></Guard>} />
          <Route path="departments/:id" element={<Guard cap="departments.view"><DepartmentDetail /></Guard>} />
          <Route path="tithes" element={<Guard cap="giving.read"><Tithes /></Guard>} />
          <Route path="reports" element={<Guard cap="reports.view"><Reports /></Guard>} />
          <Route path="reports/edit" element={<Guard cap="reports.view"><ReportEditor /></Guard>} />
          <Route path="cells" element={<Guard cap="cells.view"><Cells /></Guard>} />
          <Route path="cells/:id" element={<Guard cap="cells.view"><CellDetail /></Guard>} />
          <Route path="messages" element={<Guard cap="sms.send"><Messages /></Guard>} />
          <Route path="database" element={<Guard cap="data.manage"><Database /></Guard>} />
          <Route path="users" element={<Guard cap="users.manage"><Users /></Guard>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
      </Suspense>
      <IdleLogout />
    </DataProvider>
  );
}

export default function App() {
  if (!firebaseConfigured) return <NotConfigured />;
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="min-h-screen bg-cream"><Spinner /></div>}>
          <Routes>
            <Route path="/join" element={<PublicForm kind="member" />} />
            <Route path="/visit" element={<PublicForm kind="visitor" />} />
            <Route path="/prayer" element={<PublicPrayer />} />
            <Route path="/here/:serviceId" element={<PublicHere />} />
            <Route path="/pay" element={<PublicPay />} />
            <Route path="/give/:id" element={<PublicProject />} />
            <Route path="/charity-give" element={<PublicCharity />} />
            <Route path="/*" element={<Private />} />
          </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
