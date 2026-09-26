'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, Field, Input } from '@/components/ui/primitives';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import { findQuestions, resetPassword, type ResetState } from './actions';

const START: ResetState = { stage: 'email' };

export function ResetForm() {
  const [lookup, findAction, finding] = useActionState<ResetState, FormData>(findQuestions, START);
  const [reset, resetAction, resetting] = useActionState<ResetState, FormData>(resetPassword, START);

  // The second form takes over once the questions are known, and keeps the stage after a failed attempt.
  const state = reset.stage === 'email' ? lookup : reset;
  const questions = reset.questions ?? lookup.questions ?? [];

  if (state.stage === 'done') {
    return (
      <div className="grid gap-4">
        <Alert variant="success">Your password has been changed. You can sign in with it now.</Alert>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }

  if (state.stage === 'answer') {
    return (
      <form action={resetAction} className="grid gap-4">
        <input type="hidden" name="email" value={state.email ?? ''} />
        <p className="text-sm text-muted-foreground">
          Answering for <strong className="text-foreground">{state.email}</strong>. Capital letters and extra spaces do not matter.
        </p>
        {questions.map((q) => (
          <Field key={q.id} label={q.prompt} htmlFor={`answer_${q.id}`}>
            <Input id={`answer_${q.id}`} name={`answer_${q.id}`} autoComplete="off" required />
          </Field>
        ))}
        <Field label="New password" htmlFor="password" hint={`At least ${PASSWORD_MIN_LENGTH} characters, with a letter and a digit.`}>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
        </Field>
        <Field label="Repeat the new password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
        </Field>
        {state.error ? (
          <Alert variant="destructive" data-testid="reset-error">
            {state.error}
          </Alert>
        ) : null}
        <Button type="submit" disabled={resetting} size="lg" className="w-full">
          {resetting ? 'Checking…' : 'Set my new password'}
        </Button>
      </form>
    );
  }

  return (
    <form action={findAction} className="grid gap-4">
      <Field label="Your email address" htmlFor="email" hint="The address you sign in with.">
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      {state.error ? (
        <Alert variant="destructive" data-testid="reset-error">
          {state.error}
        </Alert>
      ) : null}
      <Button type="submit" disabled={finding} size="lg" className="w-full">
        {finding ? 'Looking…' : 'Continue'}
      </Button>
    </form>
  );
}
