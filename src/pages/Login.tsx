import { useState, type FormEvent } from 'react';
import { FullLogo, Logo } from '../components/Logo';
import { Button, Field, Input, errorText } from '../components/ui';
import { useAuth } from '../context/AuthContext';

type Mode = 'login' | 'signup' | 'reset';

export default function Login() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'login') await signIn(email, password);
      else if (mode === 'signup') await signUp(name.trim(), email, password, phone.trim());
      else {
        await resetPassword(email);
        setInfo('If that email has an account, a reset link is on its way.');
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-royal-950 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(63,188,232,0.22),transparent_55%),radial-gradient(circle_at_80%_90%,rgba(198,154,61,0.18),transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Logo light />
          <div>
            <div className="mb-8 inline-block rounded-3xl bg-white p-4 shadow-xl"><FullLogo className="h-36" /></div>
            <h1 className="font-display text-4xl font-extrabold leading-tight text-white">
              One church.<br />Every branch.<br /><span className="text-gold-300">One place.</span>
            </h1>
            <p className="mt-4 max-w-md text-royal-200">
              Members, tithes, cells, departments and SMS for every branch of Throne of God's Grace Ministries.
            </p>
          </div>
          <p className="text-xs text-royal-400">“Let us therefore come boldly unto the throne of grace.” — Hebrews 4:16</p>
        </div>
      </div>

      <div className="flex items-center justify-center bg-cream px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="font-display text-2xl font-bold text-royal-950">
            {mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset password'}
          </h2>
          <p className="mt-1 text-sm text-stone-500">
            {mode === 'login' && 'Sign in to continue.'}
            {mode === 'signup' && 'A pastor will give you access after you sign up.'}
            {mode === 'reset' && 'We will email you a link to set a new password.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === 'signup' && (
              <>
                <Field label="Full name"><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kwame Mensah" /></Field>
                <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 000 0000" /></Field>
              </>
            )}
            <Field label="Email"><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
            {mode !== 'reset' && (
              <Field label="Password">
                <Input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </Field>
            )}
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {info && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}
            <Button type="submit" loading={busy} className="w-full">
              {mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Button>
          </form>

          <div className="mt-6 space-y-2 text-center text-sm text-stone-500">
            {mode === 'login' && (
              <>
                <button className="text-royal-700 hover:underline" onClick={() => setMode('reset')}>Forgot password?</button>
                <p>New here? <button className="font-medium text-royal-700 hover:underline" onClick={() => setMode('signup')}>Create an account</button></p>
              </>
            )}
            {mode !== 'login' && (
              <button className="font-medium text-royal-700 hover:underline" onClick={() => setMode('login')}>Back to sign in</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
