import { useMemo, useState } from 'react';
import { Camera, Lock, LogOut, ShieldBan, Trash2, UserRound, KeyRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useFetch } from '../hooks';
import { compressImage } from '../compress';
import { useToast } from '../toast';
import Avatar from '../components/Avatar';
import Modal from '../components/Modal';
import { ErrorState, RowSkeleton } from '../components/Ui';

function Section({ icon: Icon, title, text, children }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-bold"><Icon size={18} className="text-coral" /> {title}</h2>
      {text && <p className="mt-1 text-sm text-muted">{text}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Submits a form and keeps a busy flag, so every section handles loading the same way.
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const run = async (fn, success) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast(success, 'success');
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

export default function Settings() {
  const { logout } = useAuth();
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-bold">Settings</h1>
      <ProfileSection />
      <PrivacySection />
      <BlockedSection />
      <PasswordSection />
      <section className="card flex items-center justify-between p-5">
        <span className="text-sm text-muted">Signed in on this device</span>
        <button onClick={logout} className="btn btn-ghost"><LogOut size={16} /> Log out</button>
      </section>
      <DeleteSection />
    </div>
  );
}

function ProfileSection() {
  const { user, setUser } = useAuth();
  const [avatar, setAvatar] = useState(null);
  const [bio, setBio] = useState(user.bio);
  const [busy, run] = useSubmit();
  const preview = useMemo(() => avatar && URL.createObjectURL(avatar), [avatar]);

  function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    form.delete('avatar');
    run(async () => {
      if (avatar) form.append('avatar', await compressImage(avatar, 512));
      const data = await api('/users/me', { method: 'PATCH', body: form });
      setUser(data.user);
      setAvatar(null);
    }, 'Profile updated');
  }

  return (
    <Section icon={UserRound} title="Profile">
      <form onSubmit={submit} className="space-y-4">
        <label className="flex w-fit cursor-pointer items-center gap-4">
          <input name="avatar" type="file" accept="image/*" onChange={(e) => setAvatar(e.target.files[0] ?? null)} className="sr-only" />
          <span className="relative">
            <Avatar user={preview ? { avatarUrl: preview } : user} size={72} />
            <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-lg bg-coral text-bg ring-4 ring-card"><Camera size={14} /></span>
          </span>
          <span className="text-sm font-semibold text-coral">Change photo</span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-muted">Name</span>
          <input name="name" defaultValue={user.name} required maxLength={50} className="input" />
        </label>
        <label className="block">
          <span className="mb-1.5 flex justify-between text-xs font-semibold text-muted">Bio <span>{bio.length}/160</span></span>
          <textarea name="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={3} className="input resize-none" />
        </label>
        <button disabled={busy} className="btn btn-primary">{busy ? 'Saving…' : 'Save profile'}</button>
      </form>
    </Section>
  );
}

function PrivacySection() {
  const { user, setUser } = useAuth();
  const [busy, run] = useSubmit();

  const toggle = () => run(async () => {
    const data = await api('/users/me', { method: 'PATCH', body: { isPrivate: !user.isPrivate } });
    setUser(data.user);
  }, user.isPrivate ? 'Your account is public' : 'Your account is private');

  return (
    <Section icon={Lock} title="Privacy">
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span>
          <span className="block text-sm font-semibold">Private account</span>
          <span className="block text-sm text-muted">Only people you approve can see your posts, stories and followers. Turning this off approves pending requests.</span>
        </span>
        {/* Native checkbox styled as a switch: keyboard and screen readers work for free. */}
        <input type="checkbox" role="switch" checked={user.isPrivate} onChange={toggle} disabled={busy}
          className="relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition checked:bg-coral
            before:absolute before:top-1 before:left-1 before:size-5 before:rounded-full before:bg-fg before:transition checked:before:translate-x-5
            focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral disabled:opacity-60" />
      </label>
    </Section>
  );
}

function BlockedSection() {
  const { data, error, loading, reload, setData } = useFetch('/blocks');
  const [, run] = useSubmit();

  const unblock = (u) => run(async () => {
    await api(`/users/${u._id}/block`, { method: 'POST' });
    setData((d) => ({ users: d.users.filter((x) => x._id !== u._id) }));
  }, `Unblocked @${u.username}`);

  return (
    <Section icon={ShieldBan} title="Blocked accounts" text="People you block can’t find your profile, see your posts or message you.">
      {loading && !data && <RowSkeleton rows={2} />}
      {error && <ErrorState plain message={error} onRetry={reload} />}
      {data?.users.length === 0 && <p className="text-sm text-muted">You haven’t blocked anyone.</p>}
      {data?.users.map((u) => (
        <div key={u._id} className="flex items-center gap-3 py-2">
          <Avatar user={u} size={38} />
          <span className="flex-1 text-sm font-semibold">@{u.username}</span>
          <button onClick={() => unblock(u)} className="btn btn-ghost px-3 py-1.5 text-xs">Unblock</button>
        </div>
      ))}
    </Section>
  );
}

function PasswordSection() {
  const [busy, run] = useSubmit();

  function submit(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    run(() => api('/users/me/password', { method: 'PATCH', body }), 'Password changed').then((ok) => ok && form.reset());
  }

  return (
    <Section icon={KeyRound} title="Change password">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <input name="currentPassword" type="password" required autoComplete="current-password" placeholder="Current password" aria-label="Current password" className="input" />
        <input name="newPassword" type="password" required minLength={6} autoComplete="new-password" placeholder="New password (6+ chars)" aria-label="New password" className="input" />
        <button disabled={busy} className="btn btn-ghost w-fit">{busy ? 'Saving…' : 'Update password'}</button>
      </form>
    </Section>
  );
}

function DeleteSection() {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, run] = useSubmit();

  function submit(e) {
    e.preventDefault();
    const { password } = Object.fromEntries(new FormData(e.currentTarget));
    run(() => api('/users/me', { method: 'DELETE', body: { password } }), 'Your account was deleted').then((ok) => ok && logout());
  }

  return (
    <section className="card border-red-500/30 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-bold text-red-300"><Trash2 size={18} /> Delete account</h2>
      <p className="mt-1 text-sm text-muted">Permanently removes your profile, posts, comments, messages and followers. This can’t be undone.</p>
      <button onClick={() => setOpen(true)} className="btn mt-4 bg-red-500/15 text-red-300 hover:bg-red-500/25">Delete my account</button>
      {open && (
        <Modal onClose={() => setOpen(false)} className="w-[min(92vw,24rem)]">
          <form onSubmit={submit} className="card p-6">
            <h2 className="text-lg font-bold">Delete your account?</h2>
            <p className="mt-2 text-sm text-muted">Enter your password to confirm. Everything you’ve shared will be removed for good.</p>
            <input name="password" type="password" required autoFocus autoComplete="current-password" placeholder="Password" aria-label="Password" className="input mt-4" />
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">Cancel</button>
              <button disabled={busy} className="btn bg-red-500 text-white hover:bg-red-500/85">{busy ? 'Deleting…' : 'Delete forever'}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
