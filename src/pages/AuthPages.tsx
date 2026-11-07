import { useState, type FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Heart, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import type { User } from '../lib/types.ts';
import { Brand } from '../components/Brand.tsx';
import { useAuth } from '../components/AuthContext.tsx';

export function WelcomePage() {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoading />;
  if (user) return <Navigate to="/feed" replace />;

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

  if (loading) return <AuthLoading />;
  if (user) return <Navigate to="/feed" replace />;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const result = await api<{ user: User }>(`/auth/${isJoin ? 'register' : 'login'}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setUser(result.user);
      navigate(searchParams.get('next') || '/feed', { replace: true });
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
        <h1>{isJoin ? 'Make yourself at home.' : 'Welcome back.'}</h1>
        <p>{isJoin ? 'Join a community growing good things.' : 'Your people have been saving you a spot.'}</p>
        <form className="auth-form" onSubmit={submit}>
          {isJoin && <label className="field-label">Your name<div className="input-wrap"><UserRound size={17} /><input name="displayName" autoComplete="name" placeholder="How should we call you?" minLength={2} maxLength={60} required /></div></label>}
          {isJoin && <label className="field-label">Username<div className="input-wrap"><span className="input-prefix">@</span><input name="username" autoComplete="username" placeholder="yourname" minLength={3} maxLength={24} pattern="[A-Za-z0-9_]+" required /></div><small>3–24 letters, numbers or underscores.</small></label>}
          <label className="field-label">Email address<div className="input-wrap"><Mail size={17} /><input type="email" name="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required /></div></label>
          <label className="field-label">Password<div className="input-wrap"><LockKeyhole size={17} /><input type={showPassword ? 'text' : 'password'} name="password" autoComplete={isJoin ? 'new-password' : 'current-password'} placeholder={isJoin ? 'At least 8 characters' : 'Your password'} minLength={isJoin ? 8 : 1} maxLength={128} required /><button className="password-toggle" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="button button-primary auth-submit" type="submit" disabled={pending}>{pending ? 'One moment…' : isJoin ? 'Create account' : 'Sign in'} <ArrowRight size={17} /></button>
        </form>
        <div className="auth-switch">{isJoin ? 'Already part of the Gees?' : 'New around here?'} <Link to={isJoin ? '/signin' : '/join'}>{isJoin ? 'Sign in' : 'Create an account'}</Link></div>
        <div className="auth-privacy"><LockKeyhole size={13} /> Your details stay yours.</div>
      </div>
      <div className="auth-footer">Learn. Build. Earn. Give. Repeat.</div>
    </div>
  );
}

function AuthLoading() {
  return <div className="full-loading"><span className="loading-orbit" /><span>Getting your Geemifi ready…</span></div>;
}