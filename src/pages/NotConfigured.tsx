import { Logo } from '../components/Logo';
import { Card } from '../components/ui';

export default function NotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <Card className="w-full max-w-xl p-8">
        <Logo />
        <h1 className="mt-6 font-display text-xl font-bold text-royal-950">Connect Firebase to get started</h1>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-stone-600">
          <li>Create a project at <b>console.firebase.google.com</b> and add a <b>Web app</b>.</li>
          <li>Enable <b>Authentication → Email/Password</b> and create a <b>Firestore database</b>.</li>
          <li>Copy <code className="rounded bg-stone-100 px-1">.env.example</code> to <code className="rounded bg-stone-100 px-1">.env.local</code> and paste in your web app config.</li>
          <li>Deploy the security rules: <code className="rounded bg-stone-100 px-1">firebase deploy --only firestore</code></li>
          <li>Restart the dev server. The first account you create becomes the <b>Head Pastor</b>.</li>
        </ol>
      </Card>
    </div>
  );
}
