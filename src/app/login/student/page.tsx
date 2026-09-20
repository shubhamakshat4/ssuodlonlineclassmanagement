import Link from 'next/link';
import { AuthFrame } from '@/components/auth-frame';
import { appConfig } from '@/lib/env';
import { GoogleSignInButton } from './google-button';

export const metadata = { title: 'Student sign in — SSU ODL' };

export default async function StudentLoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthFrame
      title="Student sign in"
      intro={
        <>
          Use your <strong className="text-foreground">@{appConfig.allowedStudentDomain}</strong> Google account. Personal Gmail accounts are not accepted.
        </>
      }
      footer={
        <>
          Faculty or admin?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in with email and password
          </Link>
        </>
      }
    >
      <GoogleSignInButton next={next ?? ''} hostedDomain={appConfig.allowedStudentDomain} initialError={error} />
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Any university account can sign in. If no classes are assigned to you yet, contact the ODL department to be added to your batch.
      </p>
    </AuthFrame>
  );
}
