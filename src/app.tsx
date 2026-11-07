import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthContext.tsx';
import { AppShell } from './components/AppShell.tsx';
import { Brand } from './components/Brand.tsx';
import {
  AuthPage, ForgotPasswordPage, ResendVerificationPage, ResetPasswordPage, VerifyEmailPage, WelcomePage,
} from './pages/AuthPages.tsx';
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
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/resend-verification" element={<ResendVerificationPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<PublicProfileLayout />}>
          <Route path="/profile/:username" element={<PublicProfilePage />} />
        </Route>
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
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}

function PublicProfileLayout() {
  const { user } = useAuth();
  return (
    <div className="public-profile-shell">
      <header className="public-profile-header">
        <Brand />
        {user ? <Link to="/explore">Back to community</Link> : <Link to="/signin">Sign in</Link>}
      </header>
      <main className="public-profile-main"><Outlet /></main>
    </div>
  );
}

function ProtectedApp() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <div className="full-loading"><span className="loading-orbit" /><span>Getting your Geemifi ready…</span></div>;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(location.pathname)}`} replace />;
  return <Outlet />;
}
