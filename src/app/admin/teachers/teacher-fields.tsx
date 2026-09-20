import { Field, Input } from '@/components/ui/primitives';
import type { Profile, Teacher } from '@/lib/db/types';

export function TeacherFields({ profile, teacher }: { profile?: Profile; teacher?: Teacher }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {profile ? <input type="hidden" name="id" value={profile.id} /> : null}
      <Field label="Full name" htmlFor="full_name">
        <Input id="full_name" name="full_name" defaultValue={profile?.full_name} required />
      </Field>
      <Field label="Login email" htmlFor="email" hint="Receives the invite; used for password sign-in.">
        <Input id="email" name="email" type="email" defaultValue={profile?.email} required />
      </Field>
      <Field label="Phone" htmlFor="phone">
        <Input id="phone" name="phone" defaultValue={profile?.phone ?? ''} />
      </Field>
      <Field label="Employee code" htmlFor="employee_code">
        <Input id="employee_code" name="employee_code" defaultValue={teacher?.employee_code} required className="font-mono uppercase" />
      </Field>
      <Field label="Microsoft 365 UPN" htmlFor="entra_upn" hint="Teams sign-in of the teacher in the university tenant (co-organiser).">
        <Input id="entra_upn" name="entra_upn" type="email" defaultValue={teacher?.entra_upn} required />
      </Field>
      <Field label="Entra object id" htmlFor="entra_user_id" hint="Optional; resolved automatically from the UPN during provisioning.">
        <Input id="entra_user_id" name="entra_user_id" defaultValue={teacher?.entra_user_id ?? ''} className="font-mono" />
      </Field>
      <Field label="Department" htmlFor="department">
        <Input id="department" name="department" defaultValue={teacher?.department ?? ''} />
      </Field>
      {profile ? (
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" name="is_active" defaultChecked={profile.is_active} /> Account active
        </label>
      ) : null}
    </div>
  );
}
