import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner, ToastProvider } from './components/ui';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { firebaseConfigured } from './lib/firebase';
import { can, isGlobal, type Capability } from './lib/roles';
import Attendance from './pages/Attendance';
import Branches from './pages/Branches';
import CheckIn from './pages/CheckIn';
import Dashboard from './pages/Dashboard';
import Departments from './pages/Departments';
import Giving from './pages/Giving';
import Login from './pages/Login';
import Members from './pages/Members';
import NotConfigured from './pages/NotConfigured';
import Pending from './pages/Pending';
import PublicForm from './pages/PublicForm';
import Registrations from './pages/Registrations';
import Users from './pages/Users';
import Tithes from './pages/Tithes';
import Reports, { ReportEditor } from './pages/Reports';
import DepartmentDetail from './pages/DepartmentDetail';
import Cells from './pages/Cells';
import CellDetail from './pages/CellDetail';
import Messages from './pages/Messages';
import Database from './pages/Database';
import MemberProfile from './pages/MemberProfile';
import Prayer from './pages/Prayer';
import PublicPrayer from './pages/PublicPrayer';
import Welfare from './pages/Welfare';
import Projects, { ProjectDetail, PublicProject } from './pages/Projects';
import Charity, { PublicCharity, useCanCharity } from './pages/Charity';
import Settings from './pages/Settings';
import PublicPay from './pages/PublicPay';

function CharityGuard({ children }: { children: ReactNode }) {
  return useCanCharity() ? <>{children}</> : <Navigate to="/" replace />;
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
      <Routes>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}

export default function App() {
  if (!firebaseConfigured) return <NotConfigured />;
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/join" element={<PublicForm kind="member" />} />
            <Route path="/visit" element={<PublicForm kind="visitor" />} />
            <Route path="/prayer" element={<PublicPrayer />} />
            <Route path="/pay" element={<PublicPay />} />
            <Route path="/give/:id" element={<PublicProject />} />
            <Route path="/charity-give" element={<PublicCharity />} />
            <Route path="/*" element={<Private />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
