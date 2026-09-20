'use client';

import { useState } from 'react';
import { ActionForm } from '@/components/action-form';
import { Alert, Field, Input } from '@/components/ui/primitives';
import { validateOverrideUrl } from '@shared/sessions.ts';
import { setOverride } from '../actions';

/** Override link editor with live https validation and the host warning (warn, do not block). */
export function OverrideForm({ sessionId, current }: { sessionId: string; current: string | null }) {
  const [value, setValue] = useState(current ?? '');
  const v = value.trim() ? validateOverrideUrl(value) : null;
  return (
    <ActionForm action={setOverride} submitLabel={current ? 'Update link' : 'Use this link instead of Teams'}>
      <input type="hidden" name="id" value={sessionId} />
      <Field label="Meeting link (https)" htmlFor="url" hint="Zoom, Google Meet, or a Teams meeting you created yourself.">
        <Input id="url" name="url" type="url" placeholder="https://meet.google.com/abc-defg-hij" value={value} onChange={(e) => setValue(e.target.value)} required data-testid="override-url" />
      </Field>
      {v && !v.ok ? <Alert variant="destructive">{v.error}</Alert> : null}
      {v && v.ok && v.warning ? <Alert variant="warning">{v.warning}</Alert> : null}
      <Alert variant="warning">
        <strong>Recording will not be available to students for this class.</strong> The portal can only capture recordings of Teams meetings organised by the
        university service account. Attendance (Join clicks) still works.
      </Alert>
    </ActionForm>
  );
}
