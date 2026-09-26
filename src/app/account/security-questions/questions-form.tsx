'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert, Field, Input, Select } from '@/components/ui/primitives';
import { saveSecurityQuestions, type QuestionsState } from './actions';

export interface Question {
  id: number;
  prompt: string;
}

export function QuestionsForm({ questions, chosen }: { questions: Question[]; chosen: number[] }) {
  const [state, action, pending] = useActionState<QuestionsState, FormData>(saveSecurityQuestions, {});
  const first = chosen[0] ?? questions[0]?.id;
  const second = chosen[1] ?? questions[1]?.id;
  return (
    <form action={action} className="grid gap-5">
      {[
        { n: 1, label: 'First question', value: first },
        { n: 2, label: 'Second question', value: second },
      ].map(({ n, label, value }) => (
        <div key={n} className="grid gap-3 rounded-xl border border-border bg-muted/40 p-4">
          <Field label={label} htmlFor={`question_${n}`}>
            <Select id={`question_${n}`} name={`question_${n}`} defaultValue={String(value ?? '')} required>
              {questions.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.prompt}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Your answer" htmlFor={`answer_${n}`}>
            <Input id={`answer_${n}`} name={`answer_${n}`} autoComplete="off" required minLength={2} />
          </Field>
        </div>
      ))}
      {state?.error ? <Alert variant="destructive">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? 'Saving…' : 'Save my security questions'}
      </Button>
    </form>
  );
}
