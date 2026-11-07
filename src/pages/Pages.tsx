import { useDeferredValue, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight, Bell, BookOpen, Check, Clock3, Compass, Gift, GraduationCap, Heart,
  HeartHandshake, Lightbulb, LockKeyhole, Search, ShieldCheck, Sparkles, Wallet as WalletIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar.tsx';
import { useAuth } from '../components/AuthContext.tsx';
import { api } from '../lib/api.ts';
import type { Member, User, Wallet } from '../lib/types.ts';

export function FeedPage() {
  const { user } = useAuth();
  const firstName = user?.displayName.split(' ')[0] ?? 'Gee';
  const month = new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' });

  return (
    <>
      <div className="page-heading page-heading-home">
        <div><div className="page-kicker">YOUR COMMUNITY, YOUR PACE</div><h1>Hey, {firstName}<span className="wave">✦</span></h1><p>A good place to start is wherever you are.</p></div>
        <div className="date-chip"><span className="date-dot" /> {month}</div>
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-primary">
          <section className="welcome-card">
            <div className="welcome-card-copy">
              <span className="card-overline">THE GEEMIFI WAY</span>
              <h2>There’s room for<br />your kind of good.</h2>
              <p>Share what you make, pass on what you know, and meet the Gees doing the same.</p>
              <Link to="/profile" className="button button-light">Make it yours <ArrowRight size={16} /></Link>
            </div>
            <div className="welcome-card-art" aria-hidden="true"><div className="sun-disc" /><div className="art-letter">G</div><span className="art-emoji emoji-one">✦</span><span className="art-emoji emoji-two">♡</span><span className="art-emoji emoji-three">✧</span><span className="art-emoji emoji-four">✷</span><span className="art-tiny-orbit" /></div>
            <span className="welcome-card-index">01 / A PLACE TO BEGIN</span>
          </section>

          <section className="quick-paths" aria-labelledby="paths-title">
            <div className="section-heading"><div><span className="section-kicker">FIND YOUR NEXT STEP</span><h2 id="paths-title">Good things to explore</h2></div><Sparkles className="section-sparkle" size={19} /></div>
            <div className="path-grid">
              <Link to="/explore" className="path-tile path-explore"><span className="path-icon"><Compass size={19} /></span><span className="path-label">Meet the Gees</span><span className="path-detail">Find your people</span><ArrowRight className="path-arrow" size={16} /></Link>
              <Link to="/learn" className="path-tile path-learn"><span className="path-icon"><GraduationCap size={20} /></span><span className="path-label">Learn something</span><span className="path-detail">Skills for what’s next</span><ArrowRight className="path-arrow" size={16} /></Link>
              <Link to="/bounties" className="path-tile path-build"><span className="path-icon"><HeartHandshake size={20} /></span><span className="path-label">Find an opportunity</span><span className="path-detail">Make good things happen</span><ArrowRight className="path-arrow" size={16} /></Link>
            </div>
          </section>

          <section className="feed-empty-panel">
            <div className="feed-empty-top"><span className="feed-empty-icon"><Heart size={20} /></span><span className="feed-phase">FEED · PHASE 2</span></div>
            <h2>Your corner of the community is ready.</h2>
            <p>Posts and conversations are on their way. In the meantime, find a few Gees whose work makes your day a little brighter.</p>
            <Link to="/explore" className="text-link">Explore the community <ArrowRight size={15} /></Link>
            <div className="feed-empty-decoration" aria-hidden="true"><span>✦</span><span>✷</span><span>♡</span></div>
          </section>
        </div>

        <aside className="dashboard-aside">
          <WalletPeek />
          <section className="aside-card community-principle"><div className="principle-icon"><Gift size={18} /></div><span className="section-kicker">A NOTE FROM THE GEES</span><h3>Everyone has something to give.</h3><p>And everyone has something new to learn. That’s how we grow, together.</p><span className="principle-signature">Be a good thing. <b>✦</b></span></section>
          <section className="aside-card roadmap-card"><div className="roadmap-heading"><span>WHAT WE’RE GROWING</span><span className="roadmap-seed">✿</span></div><div className="roadmap-step is-ready"><span className="roadmap-marker"><Check size={12} /></span><span><b>Your account & profile</b><small>Ready for you</small></span></div><div className="roadmap-step"><span className="roadmap-marker"><span /></span><span><b>Community feed</b><small>Coming in Phase 2</small></span></div><div className="roadmap-step"><span className="roadmap-marker"><span /></span><span><b>Tips, gifts & bounties</b><small>Growing in stages</small></span></div></section>
        </aside>
      </div>
    </>
  );
}

function WalletPeek() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api<Wallet>('/me/wallet').then(setWallet).catch(() => setError(true));
  }, []);

  return (
    <section className="wallet-peek">
      <div className="wallet-peek-head"><span className="wallet-icon"><WalletIcon size={17} /></span><span>YOUR WALLET</span><Link to="/wallet" aria-label="Open wallet"><ArrowRight size={16} /></Link></div>
      {error ? <p className="wallet-error">Your wallet summary couldn’t load.</p> : <><div className="wallet-amount">{wallet ? `${wallet.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'} <span>G$</span></div><div className="wallet-footnote"><ShieldCheck size={13} /> Actual wallet balance</div><div className="wallet-divider" /><div className="allowance-note"><span className="allowance-spark">✦</span><span><b>No active allowance</b><small>Kindness allowance isn’t a wallet balance.</small></span></div></>}
    </section>
  );
}

export function ExplorePage() {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    api<{ members: Member[] }>(`/users?q=${encodeURIComponent(deferredQuery)}`)
      .then((result) => { if (active) { setMembers(result.members); setError(''); } })
      .catch(() => { if (active) setError('We couldn’t load the community. Try again in a moment.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [deferredQuery]);

  return (
    <>
      <div className="page-heading"><div><div className="page-kicker">GOOD PEOPLE, GOOD IDEAS</div><h1>Explore</h1><p>Find Gees to learn from, cheer on and grow with.</p></div><div className="heading-art-chip"><Compass size={20} /></div></div>
      <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search names or usernames" aria-label="Search the community" /><span>GEES</span></label>
      <section className="member-list">
        {loading ? <MemberSkeletons /> : error ? <ErrorPanel message={error} /> : members.length ? members.map((member) => <MemberRow key={member.id} member={member} />) : <EmptyState icon={<Sparkles size={22} />} title={query ? 'No Gees found just yet.' : 'You’re one of the first Gees here.'} body={query ? 'Try another name or username.' : 'As more people join, you’ll find their profiles here. Your own profile is a lovely place to start.'} action={<Link className="text-link" to="/profile">Finish your profile <ArrowRight size={15} /></Link>} />}
      </section>
    </>
  );
}

function MemberRow({ member }: { member: Member }) {
  return <Link className="member-row" to={`/profile/${member.username}`}><Avatar name={member.displayName} src={member.avatarUrl} /><span className="member-copy"><b>{member.displayName}{member.verificationStatus === 'verified' && <ShieldCheck className="verified-mark" size={14} />}</b><small>@{member.username}</small><span>{member.bio || 'A new Gee in the community.'}</span></span><ArrowRight size={17} className="member-arrow" /></Link>;
}

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ user: User }>('/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: form.get('displayName'),
          bio: form.get('bio'),
          avatarUrl: form.get('avatarUrl'),
        }),
      });
      setUser(result.user);
      setNotice('Your profile is up to date.');
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : 'Your profile could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <div className="page-heading"><div><div className="page-kicker">YOUR PLACE IN THE COMMUNITY</div><h1>Your profile</h1><p>Let people know what you’re here to share.</p></div><div className="heading-art-chip profile-heading-chip"><Avatar name={user.displayName} src={user.avatarUrl} /></div></div>
      <section className="profile-preview"><div className="profile-cover"><span className="cover-spark cover-spark-one">✦</span><span className="cover-spark cover-spark-two">✧</span><span className="cover-caption">ONE OF THE GEES <b>✦</b></span></div><div className="profile-preview-body"><Avatar name={user.displayName} src={user.avatarUrl} size="large" /><div className="profile-preview-copy"><h2>{user.displayName}</h2><span>@{user.username}</span><p>{user.bio || 'A new Gee, ready to learn, build and give.'}</p><small>Joined {new Date(user.createdAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })}</small></div><div className="profile-preview-status"><span className="status-dot" /> YOUR PROFILE</div></div></section>
      <section className="form-panel"><div className="form-panel-head"><div><span className="section-kicker">MAKE IT YOURS</span><h2>Edit profile</h2></div><span className="form-panel-icon"><UserRound size={18} /></span></div>
        <form className="profile-form" onSubmit={saveProfile}>
          <label className="field-label">Display name<input className="plain-input" name="displayName" defaultValue={user.displayName} minLength={2} maxLength={60} required /></label>
          <label className="field-label">About you<textarea className="plain-input bio-input" name="bio" defaultValue={user.bio} placeholder="What do you like making, learning or sharing?" maxLength={240} /><small>Up to 240 characters.</small></label>
          <label className="field-label">Profile photo URL<input className="plain-input" name="avatarUrl" defaultValue={user.avatarUrl ?? ''} type="url" placeholder="https://…" /><small>Use a secure image URL. Uploads are coming in a later phase.</small></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          {notice && <div className="form-success" role="status"><Check size={16} />{notice}</div>}
          <div className="profile-form-actions"><span><LockKeyhole size={13} /> Email and account identity stay private.</span><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'} <ArrowRight size={16} /></button></div>
        </form>
      </section>
    </>
  );
}

export function BountiesPage() {
  return <ModulePage kicker="MAKE SOMETHING GOOD HAPPEN" title="Bounties" description="A place for useful work, bright ideas and a chance to earn." icon={<HeartHandshake size={22} />} theme="yellow">
    <div className="module-banner bounty-banner"><div className="banner-copy"><span className="section-kicker">COMMUNITY OPPORTUNITIES</span><h2>Good work deserves a good opportunity.</h2><p>Community challenges and creative tasks will live here, with clear rewards and room for everyone to contribute.</p></div><div className="banner-art bounty-art" aria-hidden="true"><span>✦</span><HeartHandshake size={43} /><span>✧</span></div></div>
    <EmptyState icon={<Clock3 size={22} />} title="Bounties are growing in a later phase." body="The opportunity board, submissions and reward settlement are not open yet. We’ll bring them here once each part is ready." />
  </ModulePage>;
}

export function LearnPage() {
  const subjects = [
    { name: 'AI Automation', detail: 'Make everyday work flow better.', icon: <Sparkles size={19} />, color: 'subject-lavender' },
    { name: 'AI Agents', detail: 'Explore a new kind of helper.', icon: <Lightbulb size={19} />, color: 'subject-yellow' },
    { name: 'Vibe Coding', detail: 'Turn curious ideas into tools.', icon: <BookOpen size={19} />, color: 'subject-blue' },
    { name: 'Digital skills', detail: 'Build confidence with tech.', icon: <GraduationCap size={20} />, color: 'subject-coral' },
  ];
  return <ModulePage kicker="LEARN AT YOUR OWN PACE" title="Geemifi Academy" description="Practical skills for the things you want to make next." icon={<GraduationCap size={22} />} theme="lilac">
    <div className="academy-intro"><span className="academy-cap"><GraduationCap size={25} /></span><div><span className="section-kicker">LEARN. GET CERTIFIED. GROW.</span><h2>Curiosity takes you places.</h2><p>We’re shaping short, practical courses to help you build useful skills and show what you know.</p></div><div className="academy-orbit" aria-hidden="true">✦</div></div>
    <div className="section-heading module-section-heading"><div><span className="section-kicker">THE FIRST LEARNING PATHS</span><h2>What you’ll explore</h2></div><span className="coming-chip">COMING SOON</span></div>
    <div className="subject-grid">{subjects.map((subject) => <article className={`subject-card ${subject.color}`} key={subject.name}><span className="subject-icon">{subject.icon}</span><h3>{subject.name}</h3><p>{subject.detail}</p><span className="subject-status"><span /> IN DEVELOPMENT</span></article>)}</div>
    <div className="academy-note"><ShieldCheck size={17} /><span>Courses, assessments and verified certificates will be managed by Geemifi.</span></div>
  </ModulePage>;
}

export function NotificationsPage() {
  return <ModulePage kicker="THE KIND THINGS PEOPLE DO" title="Notifications" description="Your activity and community updates, all in one place." icon={<Bell size={22} />} theme="coral">
    <EmptyState icon={<Bell size={22} />} title="A little quiet for now." body="When a Gee connects with you or something needs your attention, you’ll find it here." />
  </ModulePage>;
}

export function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api<Wallet>('/me/wallet').then(setWallet).catch(() => setError(true));
  }, []);

  return <ModulePage kicker="A CLEAR VIEW OF YOUR G$" title="My wallet" description="Your actual wallet balance, separate from any future tipping allowance." icon={<WalletIcon size={22} />} theme="green">
    {error ? <ErrorPanel message="Your wallet couldn’t load right now." /> : <>
      <section className="wallet-main-card"><div className="wallet-main-label"><span className="wallet-icon"><WalletIcon size={17} /></span> ACTUAL WALLET BALANCE</div><div className="wallet-main-amount">{wallet ? wallet.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'} <span>G$</span></div><p>Money in your wallet is different from any unspent kindness allowance.</p><div className="wallet-values"><div><span>Received</span><b>{wallet ? `${wallet.received.toFixed(2)} G$` : '—'}</b></div><div><span>Given</span><b>{wallet ? `${wallet.given.toFixed(2)} G$` : '—'}</b></div></div></section>
      <section className="wallet-allowance"><span className="allowance-icon"><Heart size={18} /></span><div><b>Kindness allowance</b><p>{wallet?.allowance == null ? 'No allowance is currently allocated to your account.' : `${wallet.allowance} G$ available to tip until it expires.`} An allowance is for tipping only; it is never part of your withdrawable wallet balance.</p></div><span className="allowance-state">NOT ACTIVE</span></section>
      <section className="transaction-panel"><div className="section-heading"><div><span className="section-kicker">YOUR G$ ACTIVITY</span><h2>Transactions</h2></div><span className="transaction-mark">↗</span></div><EmptyState icon={<WalletIcon size={21} />} title="No transactions yet." body="Confirmed and pending activity will show here when wallet features are available." /></section>
    </>}
  </ModulePage>;
}

function ModulePage({ children, kicker, title, description, icon, theme }: { children: React.ReactNode; kicker: string; title: string; description: string; icon: React.ReactNode; theme: string }) {
  return <><div className="page-heading"><div><div className="page-kicker">{kicker}</div><h1>{title}</h1><p>{description}</p></div><div className={`heading-art-chip theme-${theme}`}>{icon}</div></div><div className="module-content">{children}</div></>;
}

function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-state"><span className="empty-state-icon">{icon}</span><h2>{title}</h2><p>{body}</p>{action && <div className="empty-action">{action}</div>}</div>;
}

function ErrorPanel({ message }: { message: string }) {
  return <div className="error-panel" role="alert"><span>!</span><p>{message}</p></div>;
}

function MemberSkeletons() {
  return <div className="skeleton-stack" aria-label="Loading community"><span /><span /><span /></div>;
}