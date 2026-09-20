import { Field, Input, Select } from '@/components/ui/primitives';
import type { Batch, Program } from '@/lib/db/types';

/** Shared inputs for create/edit batch forms (rendered inside an ActionForm). */
export function BatchFields({ programs, batch }: { programs: Program[]; batch?: Batch }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {batch ? <input type="hidden" name="id" value={batch.id} /> : null}
      <Field label="Programme" htmlFor="program_id">
        <Select id="program_id" name="program_id" defaultValue={batch?.program_id ?? ''} required>
          <option value="" disabled>
            Select…
          </option>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Code" htmlFor="code" hint="e.g. BBA-ODL-2026">
        <Input id="code" name="code" defaultValue={batch?.code} required className="font-mono uppercase" />
      </Field>
      <Field label="Name" htmlFor="name">
        <Input id="name" name="name" defaultValue={batch?.name} required />
      </Field>
      <Field label="Intake year" htmlFor="intake_year">
        <Input id="intake_year" name="intake_year" type="number" defaultValue={batch?.intake_year ?? new Date().getFullYear()} required />
      </Field>
      <Field label="Current semester" htmlFor="current_semester">
        <Input id="current_semester" name="current_semester" type="number" min={1} max={12} defaultValue={batch?.current_semester ?? 1} required />
      </Field>
      <Field label="Start date" htmlFor="start_date">
        <Input id="start_date" name="start_date" type="date" defaultValue={batch?.start_date ?? ''} />
      </Field>
      <Field label="End date" htmlFor="end_date">
        <Input id="end_date" name="end_date" type="date" defaultValue={batch?.end_date ?? ''} />
      </Field>
      {batch ? (
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" name="is_active" defaultChecked={batch.is_active} /> Active
        </label>
      ) : null}
    </div>
  );
}
