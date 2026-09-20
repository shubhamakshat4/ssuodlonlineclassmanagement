import { requireUser } from '@/lib/auth/session';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import { PasswordForm } from './password-form';

export const metadata = { title: 'Set your password — SSU ODL' };

export default async function PasswordPage() {
  const user = await requireUser();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{user.mustChangePassword ? 'Set a new password' : 'Change password'}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.mustChangePassword
            ? 'This is your first sign-in. Choose a password you will remember before continuing.'
            : `Signed in as ${user.email}.`}{' '}
          Minimum {PASSWORD_MIN_LENGTH} characters with at least one letter and one digit.
        </p>
      </div>
      <PasswordForm />
    </main>
  );
}
