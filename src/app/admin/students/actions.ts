'use server';

import { z } from 'zod';
import { ActionError, audit, formAction, must } from '@/lib/actions';
import { provisionUser, deleteUser, updateUserEmail, setUserPassword } from '@/lib/admin/provision';
import { appConfig } from '@/lib/env';
import { validatePassword } from '@/lib/auth/password';

const STATUS = z.enum(['active', 'on_hold', 'withdrawn', 'graduated']);
const EMAIL = z.string().trim().toLowerCase().email();

/**
 * A student has two addresses and neither is invented: the university one from the SSU Email Id column
 * (blank until the university issues it) and their own. They sign in with the university address when
 * there is one, otherwise with their personal address.
 */
function loginEmail(college: string | undefined, personal: string | undefined): string {
  const login = college || personal;
  if (!login) throw new ActionError('Enter a university email, a personal email, or both.', { college_email: 'One address is required' });
  return login;
}

const createSchema = z.object({
  full_name: z.string().min(2),
  college_email: EMAIL.optional(),
  personal_email: EMAIL.optional(),
  phone: z.string().optional(),
  roll_number: z.string().min(2).transform((s) => s.toUpperCase()).optional(),
  batch_id: z.string().uuid(),
  secondary_batch_id: z.string().uuid().optional(),
  status: STATUS.default('active'),
});

export const createStudent = formAction({ roles: ['admin'], schema: createSchema, revalidate: ['/admin/students', '/admin'] }, async (input, { supabase }) => {
  const login = loginEmail(input.college_email, input.personal_email);
  const userId = await provisionUser({ email: login, fullName: input.full_name, phone: input.phone, role: 'student' });
  const { error } = await supabase.from('students').insert({
    id: userId,
    roll_number: input.roll_number ?? null,
    batch_id: input.batch_id,
    secondary_batch_id: input.secondary_batch_id ?? null,
    college_email: input.college_email ?? null,
    personal_email: input.personal_email ?? null,
    status: input.status,
  });
  if (error) {
    await deleteUser(userId);
    throw error;
  }
  await audit(supabase, 'student.created', 'students', userId, { roll_number: input.roll_number ?? null, batch_id: input.batch_id });
  return { message: `${input.full_name} created. They sign in as ${login} with the first-login password ${appConfig.studentDefaultPassword}.` };
});

const updateSchema = z.object({
  id: z.string().uuid(),
  secondary_batch_id: z.string().uuid().optional(),
  full_name: z.string().min(2),
  college_email: EMAIL.optional(),
  personal_email: EMAIL.optional(),
  phone: z.string().optional(),
  roll_number: z.string().min(2).transform((s) => s.toUpperCase()).optional(),
  batch_id: z.string().uuid(),
  status: STATUS,
  is_active: z.coerce.boolean().optional(),
});

export const updateStudent = formAction(
  { roles: ['admin'], schema: updateSchema, revalidate: (i) => ['/admin/students', `/admin/students/${i.id}`] },
  async (input, { supabase }) => {
    const login = loginEmail(input.college_email, input.personal_email);
    const current = must(await supabase.from('profiles').select('email').eq('id', input.id).single()) as { email: string };
    if (current.email.toLowerCase() !== login) await updateUserEmail(input.id, login);
    must(
      await supabase
        .from('profiles')
        .update({ full_name: input.full_name, email: login, phone: input.phone ?? null, is_active: input.is_active ?? false })
        .eq('id', input.id)
        .select('id')
        .single(),
    );
    must(
      await supabase
        .from('students')
        .update({
          roll_number: input.roll_number ?? null,
          batch_id: input.batch_id,
          secondary_batch_id: input.secondary_batch_id ?? null,
          college_email: input.college_email ?? null,
          personal_email: input.personal_email ?? null,
          status: input.status,
        })
        .eq('id', input.id)
        .select('id')
        .single(),
    );
    await audit(supabase, 'student.updated', 'students', input.id, { ...input });
    return { message: 'Saved.' };
  },
);

const mapSchema = z.object({ id: z.string().uuid(), roll_number: z.string().min(2).transform((s) => s.toUpperCase()), batch_id: z.string().uuid(), secondary_batch_id: z.string().uuid().optional(), status: STATUS.default('active') });

/** Map a self-registered (Google) student profile to a batch + roll number. */
export const mapStudent = formAction(
  {
    roles: ['admin'],
    schema: mapSchema,
    revalidate: ['/admin/students', '/admin', '/student'],
  },
  async (input, { supabase }) => {
    must(
      await supabase
        .from('students')
        .insert({ id: input.id, roll_number: input.roll_number, batch_id: input.batch_id, secondary_batch_id: input.secondary_batch_id ?? null, status: input.status })
        .select('id')
        .single(),
    );
    await audit(supabase, 'student.mapped', 'students', input.id, { roll_number: input.roll_number, batch_id: input.batch_id });
    return { message: 'Student mapped to the batch. Their timetable is visible on next refresh.' };
  },
);

/**
 * The ODL office sets a password for somebody who cannot sign in. Passwords are not stored in the
 * portal's own tables and cannot be read back: Supabase Auth keeps only a bcrypt hash. Setting one is
 * therefore the way an admin "changes" a password, and the audit log records that they did it.
 */
const passwordSchema = z.object({
  id: z.string().uuid(),
  password: z.string().default(''),
  must_change: z.coerce.boolean().optional(),
});

export const setStudentPassword = formAction(
  { roles: ['admin'], schema: passwordSchema, revalidate: (i) => [`/admin/students/${i.id}`] },
  async (input, { supabase }) => {
    const password = input.password.trim() || appConfig.studentDefaultPassword;
    const policyError = validatePassword(password);
    if (policyError) throw new ActionError(policyError, { password: policyError });
    await setUserPassword(input.id, password, { mustChange: input.must_change ?? true });
    await audit(supabase, 'student.password_set', 'students', input.id, { must_change: input.must_change ?? true });
    return { message: `Password set to ${password}. Tell the student; they will be asked to change it when they sign in.` };
  },
);

export const deleteStudent = formAction({ roles: ['admin'], schema: z.object({ id: z.string().uuid() }), revalidate: ['/admin/students'] }, async (input, { supabase }) => {
  await audit(supabase, 'student.deleted', 'students', input.id, {});
  await deleteUser(input.id);
});
