import { useEffect, useState } from 'react';
import { Clock, Crown, ShieldAlert } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Button, Card, errorText } from '../components/ui';
import { useAuth } from '../context/AuthContext';

export default function Pending() {
  const { profile, user, signOut, setupOpen, claimFirstAdmin } = useAuth();
  const [open, setOpen] = useState<boolean | null>(null);
  const [checkError, setCheckError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setupOpen().then(setOpen).catch((e) => { setOpen(null); setCheckError(errorText(e)); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function claim() {
    setBusy(true); setError('');
    try { await claimFirstAdmin(); } // the profile listener lets them straight in
    catch (e) { setError(errorText(e)); setBusy(false); }
  }

  const missing = !profile;

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mb-6 flex justify-center"><Logo /></div>

        {open ? (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-50 text-gold-600"><Crown /></div>
            <h1 className="font-display text-xl font-bold text-royal-950">Finish setting up the church</h1>
            <p className="mt-2 text-sm text-stone-500">
              No Head Pastor has been set up yet. If you are the Head Pastor or the person setting up the system, take full access now.
              You can add the Associate Pastor and everyone else afterwards.
            </p>
            {error && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button className="mt-6 w-full" variant="gold" loading={busy} onClick={claim}><Crown className="h-4 w-4" /> Set me up as Head Pastor (Super Admin)</Button>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-50 text-gold-600">{checkError ? <ShieldAlert /> : <Clock />}</div>
            <h1 className="font-display text-xl font-bold text-royal-950">
              {missing ? 'Account not set up' : profile.active ? 'No access yet' : 'Waiting for approval'}
            </h1>
            <p className="mt-2 text-sm text-stone-500">
              {missing
                ? 'Your login exists but has no church profile. Ask the Head Pastor or Associate Pastor to add you under Users & roles.'
                : `Hello ${profile.displayName}. The Head Pastor or Associate Pastor needs to give you a role and branch before you can continue. You'll get in automatically once they do.`}
            </p>
            {checkError && (
              <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-left text-xs text-amber-800">
                Could not reach the church database ({checkError}). Check that the Firestore database is created and the security rules are deployed (see README).
              </p>
            )}
          </>
        )}
        <p className="mt-4 text-xs text-stone-400">{user?.email}</p>
        <Button variant="outline" className="mt-4" onClick={signOut}>Sign out</Button>
      </Card>
    </div>
  );
}
