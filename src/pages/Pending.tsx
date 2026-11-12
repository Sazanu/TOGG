import { Clock } from 'lucide-react';
import { Logo } from '../components/Logo';
import { Button, Card } from '../components/ui';
import { useAuth } from '../context/AuthContext';

export default function Pending() {
  const { profile, user, signOut } = useAuth();
  const missing = !profile;
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-50 text-gold-600"><Clock /></div>
        <h1 className="font-display text-xl font-bold text-royal-950">
          {missing ? 'Account not set up' : profile.active ? 'No access yet' : 'Waiting for approval'}
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          {missing
            ? 'Your login exists but has no church profile. Ask the Head Pastor or Associate Pastor to check your account.'
            : `Hello ${profile.displayName}. The Head Pastor or Associate Pastor needs to give you a role and branch before you can continue. You'll get in automatically once they do.`}
        </p>
        <p className="mt-4 text-xs text-stone-400">{user?.email}</p>
        <Button variant="outline" className="mt-6" onClick={signOut}>Sign out</Button>
      </Card>
    </div>
  );
}
