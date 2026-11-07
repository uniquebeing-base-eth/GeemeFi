import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Heart, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import type { User } from '../lib/types.ts';
import { Brand } from '../components/Brand.tsx';
import { useAuth } from '../components/AuthContext.tsx';

export function WelcomePage() {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (user) return <Navigate to={user.accountStatus === 'active' ? '/feed' : '/wallet/setup'} replace />;

  return (
    <div className="welcome-page">
      <div className="welcome-top"><Brand /></div>
      <div className="welcome-layout">
        <section className="welcome-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> A COMMUNITY THAT GIVES BACK</div>
          <h1>Small acts.<br /><span>Big good.</span></h1>
          <p>Meet people who make things, share what you know and be part of someone else’s next step.</p>
          <div className="welcome-actions">
            <Link to="/join" className="button button-primary">Get started <ArrowRight size={17} /></Link>
            <Link to="/signin" className="button button-quiet">Sign in</Link>
          </div>
          <div className="welcome-mantra"><span>Learn.</span><span>Build.</span><span>Earn.</span><span>Give.</span><span>Repeat.</span></div>
        </section>
        <section className="welcome-art" aria-label="Geemifi's community is growing">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <span className="art-spark art-spark-one">✦</span><span className="art-spark art-spark-two">✧</span>
          <div className="art-sticker sticker-heart"><Heart size={20} fill="currentColor" /></div>
          <div className="art-sticker sticker-star">✦</div>
          <div className="geemi-bot"><div className="bot-antenna" /><div className="bot-head"><span className="bot-eye" /><span className="bot-eye" /><span className="bot-smile" /></div><div className="bot-body">G</div><div className="bot-arm bot-arm-left" /><div className="bot-arm bot-arm-right" /></div>
          <div className="art-wordmark">A little more <b>good</b> in your day.</div>
          <div className="art-caption">YOUR PEOPLE ARE HERE <span>↗</span></div>
        </section>
      </div>
      <div className="welcome-footer"><span>Made for people, by people.</span><span>© Geemifi 2026</span></div>
    </div>
  );
}

export function AuthPage({ mode }: { mode: 'signin' | 'join' }) {
  const isJoin = mode === 'join';
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading, setUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState('');

  if (loading) return <AuthLoading />;
  if (user) return <Navigate to={user.accountStatus === 'active' ? '/feed' : '/wallet/setup'} replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    setSubmittedEmail(String(payload.email));
    try {
      const result = await api<{
        user?: User;
        verificationRequired?: boolean;
      }>(`/auth/${isJoin ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (isJoin && result.verificationRequired) {
        setRegisteredEmail(String(payload.email));
        return;
      }
      if (!result.user) throw new Error('Your account could not be loaded. Please try signing in again.');
      setUser(result.user);
      navigate(result.user.accountStatus === 'active' ? searchParams.get('next') || '/feed' : '/wallet/setup', { replace: true });
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Something went wrong. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <Link to="/welcome" className="auth-brand"><Brand /></Link>
      <div className="auth-card">
        <div className="auth-icon"><Sparkles size={22} /></div>
        {registeredEmail ? <>
          <h1>Check your inbox.</h1>
          <p>We sent an email verification link to <b>{registeredEmail}</b>. Verify your address before signing in.</p>
          <p className="wallet-setup-note">Your embedded wallet will be provisioned automatically after verification.</p>
          <Link className="button button-primary auth-submit" to={`/resend-verification?email=${encodeURIComponent(registeredEmail)}`}>Resend verification email <ArrowRight size={17} /></Link>
        </> : <>
          <h1>{isJoin ? 'Make yourself at home.' : 'Welcome back.'}</h1>
          <p>{isJoin ? 'Join a community growing good things.' : 'Your people have been saving you a spot.'}</p>
          <form className="auth-form" onSubmit={submit}>
            {isJoin && <label className="field-label">Your name<div className="input-wrap"><UserRound size={17} /><input name="displayName" autoComplete="name" placeholder="How should we call you?" minLength={2} maxLength={60} required /></div></label>}
            {isJoin && <label className="field-label">Username<div className="input-wrap"><span className="input-prefix">@</span><input name="username" autoComplete="username" placeholder="yourname" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" required /></div><small>3–24 letters, numbers or underscores.</small></label>}
            <label className="field-label">Email address<div className="input-wrap"><Mail size={17} /><input type="email" name="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required /></div></label>
            <label className="field-label">Password<div className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} name="password" autoComplete={isJoin ? 'new-password' : 'current-password'} placeholder={isJoin ? 'At least 8 characters' : 'Your password'} minLength={isJoin ? 8 : 1} maxLength={128} required /><button className="password-toggle" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            {error && <div className="form-error" role="alert">{error}</div>}
            {isJoin && error && <Link to={`/resend-verification?email=${encodeURIComponent(submittedEmail)}`}>Resend verification email</Link>}
            {error.toLowerCase().includes('verify your email') && <Link to={`/resend-verification?email=${encodeURIComponent(submittedEmail)}`}>Resend verification email</Link>}
            <button className="button button-primary auth-submit" type="submit" disabled={pending}>{pending ? 'One moment…' : isJoin ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></button>
          </form>
          {!isJoin && <div className="auth-switch"><Link to="/forgot-password">Forgot your password?</Link></div>}
          <div className="auth-switch">{isJoin ? 'Already part of the Gees?' : 'New around here?'} <Link to={isJoin ? '/signin' : '/join'}>{isJoin ? 'Sign in' : 'Create an account'}</Link></div>
        </>}
        <div className="auth-privacy"><LockKeyhole size={13} /> Your details stay yours.</div>
      </div>
      <div className="auth-footer">Learn. Build. Earn. Give. Repeat.</div>
    </div>
  );
}

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const token = searchParams.get('token') ?? '';
  const [message, setMessage] = useState('Verifying your email link…');
  const [error, setError] = useState(false);
  const verificationStarted = useRef(false);

  useEffect(() => {
    if (verificationStarted.current) return;
    verificationStarted.current = true;
    if (!token) {
      setMessage('This verification link is invalid or expired.');
      setError(true);
      return;
    }
    api<{ ok: boolean; user: User }>('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
      .then(({ user }) => {
        setUser(user);
        navigate(user.accountStatus === 'active' ? '/feed' : '/wallet/setup', { replace: true });
      })
      .catch((issue: unknown) => {
        setMessage(issue instanceof Error ? issue.message : 'This verification link is invalid or expired.');
        setError(true);
      });
  }, [navigate, setUser, token]);

  return <AuthMessagePage title={error ? 'Verification link expired.' : 'Email verification'} message={message} action={<Link className="button button-primary auth-submit" to="/signin">Continue to sign in</Link>} />;
}

export function ResendVerificationPage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      await api('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) });
      setMessage('If this address has an unverified Geemifi account, a new link will arrive shortly.');
    } catch (issue) {
      setMessage(issue instanceof Error ? issue.message : 'The email could not be sent. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return <AuthMessagePage title="Resend verification" message={message} action={
    <form className="auth-form" onSubmit={submit}>
      <label className="field-label">Email address<div className="input-wrap"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></div></label>
      <button className="button button-primary auth-submit" type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send verification email'}</button>
      <Link to="/signin">Back to sign in</Link>
    </form>
  } />;
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      await api('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
      setMessage('If an account exists for this address, we will try to send reset instructions. If nothing arrives, you can safely request another link.');
    } catch (issue) {
      setMessage(issue instanceof Error ? issue.message : 'We could not process that request. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return <AuthMessagePage title="Reset your password" message={message} action={
    <form className="auth-form" onSubmit={submit}>
      <label className="field-label">Email address<div className="input-wrap"><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></div></label>
      <button className="button button-primary auth-submit" type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send reset link'}</button>
      <Link to="/signin">Back to sign in</Link>
    </form>
  } />;
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [message, setMessage] = useState(token ? '' : 'This reset link is invalid or expired.');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(!token);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password'));
    if (password !== form.get('confirmPassword')) {
      setMessage('The passwords do not match.');
      setError(true);
      return;
    }
    setPending(true);
    setMessage('');
    setError(false);
    try {
      await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      setMessage('Your password has been updated. Sign in with your new password.');
    } catch (issue) {
      setMessage(issue instanceof Error ? issue.message : 'This reset link is invalid or expired.');
      setError(true);
    } finally {
      setPending(false);
    }
  }

  return <AuthMessagePage title="Choose a new password" message="" action={
    <form className="auth-form" onSubmit={submit}>
      <label className="field-label">New password<div className="input-wrap"><LockKeyhole size={17} /><input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></div></label>
      <label className="field-label">Confirm password<div className="input-wrap"><LockKeyhole size={17} /><input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></div></label>
      {message && <div className={error ? 'form-error' : 'auth-success'} role={error ? 'alert' : 'status'}>{message}</div>}
      {message.startsWith('Your password') ? <Link className="button button-primary auth-submit" to="/signin">Sign in</Link> : <button className="button button-primary auth-submit" type="submit" disabled={pending || !token}>{pending ? 'Updating…' : 'Update password'}</button>}
      {error && <Link to="/forgot-password">Request another reset link</Link>}
    </form>
  } />;
}

function AuthMessagePage({ title, message, action, error = false }: {
  title: string;
  message: string;
  action: React.ReactNode;
  error?: boolean;
}) {
  return <div className="auth-page">
    <Link to="/welcome" className="auth-brand"><Brand /></Link>
    <div className="auth-card">
      <div className="auth-icon"><Mail size={22} /></div>
      <h1>{title}</h1>
      {message && <p className={error ? 'form-error' : undefined} role={error ? 'alert' : 'status'}>{message}</p>}
      {action}
      <div className="auth-privacy"><LockKeyhole size={13} /> Your details stay yours.</div>
    </div>
    <div className="auth-footer">Learn. Build. Earn. Give. Repeat.</div>
  </div>;
}

function AuthLoading() {
  return <div className="full-loading"><span className="loading-orbit" /><span>Getting your Geemifi ready…</span></div>;
}