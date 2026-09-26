import Link from 'next/link';
import { AuthFrame } from '@/components/auth-frame';
import { ResetForm } from './reset-form';

export const metadata = { title: 'Reset your password — SSU ODL' };

export default function ResetPage() {
  return (
    <AuthFrame
      title="Reset your password"
      intro="Answer the security questions you chose and set a new password. No email is sent."
      footer={
        <>
          Remembered it?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      <ResetForm />
    </AuthFrame>
  );
}
