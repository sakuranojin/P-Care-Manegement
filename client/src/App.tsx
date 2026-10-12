import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import RegisterProfile from './pages/RegisterProfile';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import Team from './pages/Team';
import Patients from './pages/Patients';
import Chat from './pages/Chat';
import BoardPage from './pages/BoardPage';
import Notifications from './pages/Notifications';
import ProfileEdit from './pages/ProfileEdit';
import UnitEdit from './pages/UnitEdit';
import Permissions from './pages/Permissions';
import type { ReactNode } from 'react';

function Protected({ children, needUnit = true }: { children: ReactNode; needUnit?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading">読み込み中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.profileCompleted) return <Navigate to="/register/profile" replace />;
  if (needUnit && !user.unitId) return <Navigate to="/app" replace />;
  return <>{children}</>;
}

export default function App() {
  const { user, loading } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={user && !loading ? <Navigate to="/app" replace /> : <Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/register/profile" element={<RegisterProfile />} />
      <Route path="/app" element={<Protected needUnit={false}><AppLayout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="team" element={<Team />} />
        <Route path="patients" element={<Patients />} />
        <Route path="board" element={<BoardPage />} />
        <Route path="chat" element={<Chat />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<ProfileEdit />} />
        <Route path="unit" element={<UnitEdit />} />
        <Route path="permissions" element={<Permissions />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
