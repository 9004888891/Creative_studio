import React, { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Notice, Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Setup from './pages/Setup.jsx';
import Invite from './pages/Invite.jsx';
import Reset from './pages/Reset.jsx';
import Projects from './pages/Projects.jsx';
import Account from './pages/Account.jsx';
import Users from './pages/Users.jsx';

// The studio engine is large: load it only on the pages that use it.
const ProjectPage = lazy(() => import('./pages/ProjectPage.jsx'));
const Learning = lazy(() => import('./pages/Learning.jsx'));

function Private({ children }) {
  const { user } = useAuth(), loc = useLocation();
  return user ? children : <Navigate to={'/login?next=' + encodeURIComponent(loc.pathname + loc.search)} replace />;
}

export default function App() {
  const { loading, status, user } = useAuth();
  if (loading) return <div className="center"><Spinner /></div>;
  if (status && status.error) return <div className="center narrow"><Notice kind="error">{status.error}</Notice></div>;
  if (status && status.problems) return <div className="center narrow"><Notice kind="error">The app is not configured yet: {status.problems.join(' ')}</Notice></div>;
  if (status && status.needsSetup) return <Routes><Route path="*" element={<Setup />} /></Routes>;
  return (
    <Suspense fallback={<div className="center"><Spinner /></div>}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/invite/:token" element={<Invite />} />
        <Route path="/reset/:token" element={<Reset />} />
        <Route element={<Private><Layout /></Private>}>
          <Route index element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectPage />} />
          <Route path="/learning" element={<Learning />} />
          <Route path="/users" element={<Users />} />
          <Route path="/account" element={<Account />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
