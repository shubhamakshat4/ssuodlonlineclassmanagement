import Link from 'next/link';
import { AuthFrame } from '@/components/auth-frame';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in — SSU ODL' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <AuthFrame
      title="Sign in"
      intro="Students, faculty and staff all use the email and password issued by the ODL office."
      footer={
        <>
          Forgotten your password?{' '}
          <Link href="/login/reset" className="font-medium text-primary hover:underline">
            Reset it with your security questions
          </Link>
        </>
      }
    >
      <LoginForm next={next ?? ''} initialError={error} />
    </AuthFrame>
  );
}
