'use server';

import { z } from 'zod';
import { ActionError, audit, formAction, must } from '@/lib/actions';
import { provisionUser, deleteUser, updateUserEmail } from '@/lib/admin/provision';
import { appConfig } from '@/lib/env';

const STATUS = z.enum(['active', 'on_hold', 'withdrawn', 'graduated']);

const createSchema = z.object({
  full_name: z.string().min(2),
  email: z.string().email().transform((s) => s.toLowerCase()),
  phone: z.string().optional(),
  roll_number: z.string().min(2).transform((s) => s.toUpperCase()),
  batch_id: z.string().uuid(),
  status: STATUS.default('active'),
});

export const createStudent = formAction({ roles: ['admin'], schema: createSchema, revalidate: ['/admin/students', '/admin'] }, async (input, { supabase }) => {
  const userId = await provisionUser({ email: input.email, fullName: input.full_name, phone: input.phone, role: 'student' });
  const { error } = await supabase.from('students').insert({ id: userId, roll_number: input.roll_number, batch_id: input.batch_id, status: input.status });
  if (error) {
    await deleteUser(userId);
    throw error;
  }
  await audit(supabase, 'student.created', 'students', userId, { roll_number: input.roll_number, batch_id: input.batch_id });
  return { message: `${input.full_name} created. They can now sign in with Google.` };
});

const updateSchema = z.object({
  id: z.string().uuid(),
  secondary_batch_id: z.string().uuid().optional(),
  full_name: z.string().min(2),
  email: z.string().email().transform((s) => s.toLowerCase()),
  phone: z.string().optional(),
  roll_number: z.string().min(2).transform((s) => s.toUpperCase()),
  batch_id: z.string().uuid(),
  status: STATUS,
  is_active: z.coerce.boolean().optional(),
});

export const updateStudent = formAction(
  { roles: ['admin'], schema: updateSchema, revalidate: (i) => ['/admin/students', `/admin/students/${i.id}`] },
  async (input, { supabase }) => {
    const current = must(await supabase.from('profiles').select('email').eq('id', input.id).single()) as { email: string };
    if (current.email.toLowerCase() !== input.email) {
      if (input.email.split('@')[1] !== appConfig.allowedStudentDomain) throw new ActionError(`Student email must be @${appConfig.allowedStudentDomain}.`);
      await updateUserEmail(input.id, input.email);
    }
    must(
      await supabase
        .from('profiles')
        .update({ full_name: input.full_name, email: input.email, phone: input.phone ?? null, is_active: input.is_active ?? false })
        .eq('id', input.id)
        .select('id')
        .single(),
    );
    must(
      await supabase
        .from('students')
        .update({ roll_number: input.roll_number, batch_id: input.batch_id, secondary_batch_id: input.secondary_batch_id ?? null, status: input.status })
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

export const deleteStudent = formAction({ roles: ['admin'], schema: z.object({ id: z.string().uuid() }), revalidate: ['/admin/students'] }, async (input, { supabase }) => {
  await audit(supabase, 'student.deleted', 'students', input.id, {});
  await deleteUser(input.id);
});
