'use client';

import { useActionState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/primitives';
import type { ActionState } from '@/lib/actions';
import { cn } from '@/lib/utils';

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Form wired to a formAction() server action with useActionState.
 * Children are plain inputs; field errors are rendered under the form by name.
 */
export function ActionForm({
  action,
  children,
  submitLabel = 'Save',
  pendingLabel = 'Saving…',
  className,
  resetOnSuccess = false,
  variant,
  confirm,
  inline = false,
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  confirm?: string;
  inline?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={cn(inline ? 'inline-flex items-center gap-2' : 'grid gap-3', className)}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state.error ? (
        <Alert variant="destructive" className={cn(inline && 'p-2')}>
          {state.error}
          {state.fields ? (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {Object.entries(state.fields).map(([k, v]) => (
                <li key={k}>
                  <span className="font-mono">{k}</span>: {v}
                </li>
              ))}
            </ul>
          ) : null}
        </Alert>
      ) : null}
      {state.ok && state.message ? <Alert variant="success">{state.message}</Alert> : null}
      <div className={cn(!inline && 'flex justify-end')}>
        <Button type="submit" disabled={pending} variant={variant} size={inline ? 'sm' : 'default'}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
