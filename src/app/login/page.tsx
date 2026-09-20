import Link from 'next/link';
import { AuthFrame } from '@/components/auth-frame';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in — SSU ODL' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthFrame
      title="Faculty & admin sign in"
      intro="Use the email and password issued by the ODL office."
      footer={
        <>
          Student?{' '}
          <Link href="/login/student" className="font-medium text-primary hover:underline">
            Sign in with your university Google account
          </Link>
        </>
      }
    >
      <LoginForm next={next ?? ''} initialError={error} />
    </AuthFrame>
  );
}
