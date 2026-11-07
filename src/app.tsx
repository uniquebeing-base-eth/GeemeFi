import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthContext.tsx';
import { AppShell } from './components/AppShell.tsx';
import { AuthPage, WelcomePage } from './pages/AuthPages.tsx';
import {
  BountiesPage, ExplorePage, FeedPage, LearnPage, NotificationsPage, ProfilePage, PublicProfilePage, WalletPage,
} from './pages/Pages.tsx';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/signin" element={<AuthPage mode="signin" />} />
        <Route path="/join" element={<AuthPage mode="join" />} />
        <Route element={<ProtectedApp />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/feed" replace />} />
            <Route path="/feed" element={<FeedPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/bounties" element={<BountiesPage />} />
            <Route path="/learn" element={<LearnPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:username" element={<PublicProfilePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

function ProtectedApp() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="full-loading"><span className="loading-orbit" /><span>Getting your Geemifi ready…</span></div>;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <Outlet />;
}
