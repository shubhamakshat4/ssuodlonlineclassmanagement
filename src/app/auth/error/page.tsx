import Link from 'next/link';
import { Alert } from '@/components/ui/primitives';
import { appConfig } from '@/lib/env';

const MESSAGES: Record<string, string> = {
  'no-profile': 'Your account has been deactivated in the ODL portal. Contact the ODL office.',
  'google-not-student': 'Google sign-in is only for students. Teachers and admins sign in with email and password.',
  provider: `Google could not sign you in. Make sure you chose your @${appConfig.allowedStudentDomain} account.`,
  exchange: 'The sign-in link is invalid or has expired. Please try again.',
  'missing-code': 'The sign-in link was incomplete. Please try again.',
  'no-session': 'We could not establish a session. Please try again.',
};

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string; detail?: string }> }) {
  const { reason, detail } = await searchParams;
  const message = (reason && MESSAGES[reason]) || 'Sign-in failed.';
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Sign-in problem</h1>
      <Alert variant="destructive">
        <p>{message}</p>
        {detail ? <p className="mt-2 text-xs opacity-80">Details: {detail}</p> : null}
      </Alert>
      <form action="/auth/signout" method="post">
        <button type="submit" className="text-sm text-primary underline">
          Clear session and start over
        </button>
      </form>
      <div className="flex gap-4 text-sm">
        <Link href="/login/student" className="text-primary underline">
          Student sign in
        </Link>
        <Link href="/login" className="text-primary underline">
          Teacher / admin sign in
        </Link>
      </div>
    </main>
  );
}
