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
          <Route path="members" element={<Guard cap="members.read"><Members /></Guard>} />
          <Route path="attendance" element={<Guard cap="attendance.write"><Attendance /></Guard>} />
          <Route path="attendance/:serviceId" element={<Guard cap="attendance.write"><CheckIn /></Guard>} />
          <Route path="giving" element={<Guard cap="giving.read"><Giving /></Guard>} />
          <Route path="registrations" element={<Guard cap="registrations.manage"><Registrations /></Guard>} />
          <Route path="branches" element={<Guard cap="branches.manage"><Branches /></Guard>} />
          <Route path="departments" element={<Guard cap="departments.manage"><Departments /></Guard>} />
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
            <Route path="/*" element={<Private />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
