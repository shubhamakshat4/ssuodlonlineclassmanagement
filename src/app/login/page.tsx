import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in — SSU ODL' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Teacher / admin sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Use the email and password issued by the ODL office.</p>
      </div>
      <LoginForm next={next ?? ''} initialError={error} />
      <p className="text-sm text-muted-foreground">
        Student?{' '}
        <Link href="/login/student" className="text-primary underline">
          Sign in with your university Google account
        </Link>
        .
      </p>
    </main>
  );
}
