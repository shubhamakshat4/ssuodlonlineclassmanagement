import Link from 'next/link';
import { appConfig } from '@/lib/env';
import { GoogleSignInButton } from './google-button';

export const metadata = { title: 'Student sign in — SSU ODL' };

export default async function StudentLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Student sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use your <strong>@{appConfig.allowedStudentDomain}</strong> Google account. Personal Gmail accounts are not accepted.
        </p>
      </div>
      <GoogleSignInButton next={next ?? ''} hostedDomain={appConfig.allowedStudentDomain} initialError={error} />
      <p className="text-xs text-muted-foreground">
        Any university account can sign in. If you see “No class mapped”, contact the ODL office to be added to your batch.
      </p>
      <p className="text-sm text-muted-foreground">
        Teacher or admin?{' '}
        <Link href="/login" className="text-primary underline">
          Sign in with email and password
        </Link>
        .
      </p>
    </main>
  );
}
