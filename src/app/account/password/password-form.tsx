'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Field, Input } from '@/components/ui/primitives';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import { changePassword, type PasswordState } from './actions';

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <form action={action} className="grid gap-4">
      <Field label="New password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
      </Field>
      {state?.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? 'Saving…' : 'Save password'}
      </Button>
    </form>
  );
}
