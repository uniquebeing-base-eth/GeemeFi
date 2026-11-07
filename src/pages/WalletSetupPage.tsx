import { useEffect, useRef, useState } from 'react';
import { LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../components/AuthContext.tsx';
import { Brand } from '../components/Brand.tsx';
import { api } from '../lib/api.ts';

type WalletProvisioningResult = {
  provisioningStatus: 'provisioned';
  walletAddress: string;
  user: NonNullable<ReturnType<typeof useAuth>['user']>;
};

export function WalletSetupPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const started = useRef(false);
  const destination = searchParams.get('next');
  const nextPath = destination?.startsWith('/') ? destination : '/feed';

  async function provision() {
    if (!user || pending) return;
    setPending(true);
    setError('');
    try {
      const result = await api<WalletProvisioningResult>('/me/wallet/provision', { method: 'POST' });
      setUser({ ...result.user, walletAddress: result.walletAddress });
      navigate(nextPath, { replace: true });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Wallet setup could not be completed.');
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    setSignOutError('');
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
      navigate('/signin', { replace: true });
    } catch (issue) {
      setSignOutError(issue instanceof Error ? issue.message : 'Sign out could not be completed.');
    }
  }

  useEffect(() => {
    if (user?.accountStatus === 'active') {
      navigate(nextPath, { replace: true });
      return;
    }
    if (started.current) return;
    started.current = true;
    void provision();
  }, []);

  return <div className="auth-page">
    <Link to="/welcome" className="auth-brand"><Brand /></Link>
    <div className="auth-card">
      <div className="auth-icon"><ShieldCheck size={22} /></div>
      <h1>Setting up your wallet.</h1>
      <p>Geemifi is creating your embedded smart wallet on Celo Sepolia. It is linked to your Geemifi account; no external wallet is needed.</p>
      {pending && <div className="wallet-setup-status" role="status"><span className="loading-orbit" /> Creating your secure wallet…</div>}
      {error && <div className="form-error" role="alert">{error}</div>}
      {error && <button className="button button-primary auth-submit" type="button" onClick={() => void provision()} disabled={pending}>
        <RefreshCw size={16} /> Retry wallet setup
      </button>}
      {signOutError && <div className="form-error" role="alert">{signOutError}</div>}
      <div className="auth-privacy"><LockKeyhole size={13} /> Wallet signing credentials stay server-side.</div>
      <div className="auth-switch"><button type="button" className="wallet-signout" onClick={() => void signOut()}>Sign out</button></div>
      <small className="wallet-setup-network">Celo Sepolia · Chain ID 11142220</small>
    </div>
    <div className="auth-footer">Learn. Build. Earn. Give. Repeat.</div>
  </div>;
}
