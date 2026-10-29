import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../auth';
import { useToast } from '../toast';
import { Logo } from '../components/Layout';

const MOSAIC = ['maya-0', 'leo-1', 'aria-2', 'kai-0', 'zoe-3', 'sam-1', 'extra-1-a', 'leo-3', 'zoe-0', 'aria-1', 'kai-2', 'maya-3'];

const FIELDS = {
  login: [
    { name: 'login', label: 'Username or email', autoComplete: 'username' },
    { name: 'password', label: 'Password', type: 'password', autoComplete: 'current-password' },
  ],
  register: [
    { name: 'name', label: 'Full name', autoComplete: 'name' },
    { name: 'username', label: 'Username (a-z, 0-9, _ or .)', autoComplete: 'username', pattern: '[a-zA-Z0-9_.]{3,20}', title: '3-20 characters: letters, numbers, _ or .' },
    { name: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
    { name: 'password', label: 'Password (6+ characters)', type: 'password', autoComplete: 'new-password', minLength: 6 },
  ],
};

export default function Auth({ mode }) {
  const auth = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await auth[mode](Object.fromEntries(new FormData(e.currentTarget)));
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  function fillDemo() {
    const form = document.getElementById('auth-form');
    form.login.value = 'maya';
    form.password.value = 'password123';
    form.requestSubmit();
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r border-line bg-card p-12 lg:flex lg:flex-col">
        <Logo />
        {/* A tilted wall of real posts: shows what the product is instead of decorating it. */}
        <div aria-hidden="true" className="pointer-events-none absolute -top-10 -right-36 grid w-[440px] -rotate-[8deg] grid-cols-3 gap-3 opacity-80 [mask-image:linear-gradient(to_left,black_45%,transparent_95%)] xl:-right-16">
          {MOSAIC.map((seed, i) => (
            <img key={seed} src={`https://picsum.photos/seed/pulse-${seed}/300/375`} alt="" loading="lazy"
              className={`aspect-[4/5] w-full rounded-2xl bg-raised object-cover ${i % 3 === 1 ? 'translate-y-10' : ''}`} />
          ))}
        </div>
        <div className="relative my-auto max-w-md">
          <h1 className="text-5xl leading-[1.05] font-extrabold tracking-tight">
            Share the moments that keep your <span className="text-coral">pulse</span> going.
          </h1>
          <p className="mt-5 text-muted">Photos, short videos and 24-hour stories from the people you actually care about.</p>
          <div className="mt-10 flex flex-wrap gap-3 text-sm">
            {[[Heart, 'Live likes'], [MessageCircle, 'Real-time comments'], [Sparkles, 'Stories that fade']].map(([Icon, text]) => (
              <span key={text} className="flex items-center gap-2 rounded-full border border-line bg-raised px-4 py-2"><Icon size={16} className="text-coral" />{text}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-bold">{isLogin ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1 text-sm text-muted">{isLogin ? 'Log in to see what’s new.' : 'It takes less than a minute.'}</p>

          <form id="auth-form" onSubmit={submit} className="mt-8 space-y-4">
            {FIELDS[mode].map(({ name, label, type = 'text', ...rest }) => (
              <label key={name} className="block">
                <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
                <input name={name} type={type} {...rest} required className="input" />
              </label>
            ))}
            <button disabled={busy} className="btn btn-primary w-full py-3">{busy ? 'One sec…' : isLogin ? 'Log in' : 'Sign up'}</button>
          </form>

          {isLogin && (
            <button onClick={fillDemo} disabled={busy} className="btn btn-ghost mt-3 w-full py-3">Try the demo account</button>
          )}

          <p className="mt-8 text-center text-sm text-muted">
            {isLogin ? 'New to Pulse? ' : 'Already have an account? '}
            <Link to={isLogin ? '/register' : '/login'} className="font-semibold text-coral hover:underline">
              {isLogin ? 'Create an account' : 'Log in'}
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
