import { AuthFrame } from '@/components/auth-frame';
import { requireUser } from '@/lib/auth/session';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import { PasswordForm } from './password-form';

export const metadata = { title: 'Set your password — SSU ODL' };

export default async function PasswordPage() {
  const user = await requireUser();
  return (
    <AuthFrame
      title={user.mustChangePassword ? 'Set a new password' : 'Change password'}
      intro={
        <>
          {user.mustChangePassword ? 'This is your first sign-in. Choose a password you will remember before continuing.' : `Signed in as ${user.email}.`} Minimum{' '}
          {PASSWORD_MIN_LENGTH} characters with at least one letter and one digit.
        </>
      }
    >
      <PasswordForm />
      <p className="mt-6 border-t border-border pt-4 text-sm text-muted-foreground">
        <a href="/account/security-questions" className="font-medium text-primary hover:underline">
          Set your security questions
        </a>{' '}
        so you can reset your password yourself if you forget it.
      </p>
    </AuthFrame>
  );
}
