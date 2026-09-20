'use server';

import { z } from 'zod';
import { audit, formAction, must } from '@/lib/actions';
import { provisionUser, deleteUser, resendInvite, updateUserEmail } from '@/lib/admin/provision';

const base = z.object({
  full_name: z.string().min(2),
  email: z.string().email().transform((s) => s.toLowerCase()),
  phone: z.string().optional(),
  employee_code: z.string().min(1).transform((s) => s.toUpperCase()),
  entra_upn: z.string().email('Entra UPN must look like an email').transform((s) => s.toLowerCase()),
  entra_user_id: z.string().uuid().optional(),
  department: z.string().optional(),
});

export const createTeacher = formAction({ roles: ['admin'], schema: base, revalidate: ['/admin/teachers', '/admin'] }, async (input, { supabase }) => {
  const userId = await provisionUser({ email: input.email, fullName: input.full_name, phone: input.phone, role: 'teacher' });
  const { error } = await supabase.from('teachers').insert({
    id: userId,
    employee_code: input.employee_code,
    entra_upn: input.entra_upn,
    entra_user_id: input.entra_user_id ?? null,
    department: input.department ?? null,
  });
  if (error) {
    await deleteUser(userId);
    throw error;
  }
  await audit(supabase, 'teacher.created', 'teachers', userId, { employee_code: input.employee_code, entra_upn: input.entra_upn });
  return { message: `${input.full_name} created and invited by email. They must set a password on first sign-in.` };
});

export const updateTeacher = formAction(
  { roles: ['admin'], schema: base.extend({ id: z.string().uuid(), is_active: z.coerce.boolean().optional() }), revalidate: (i) => ['/admin/teachers', `/admin/teachers/${i.id}`] },
  async (input, { supabase }) => {
    const current = must(await supabase.from('profiles').select('email').eq('id', input.id).single()) as { email: string };
    if (current.email.toLowerCase() !== input.email) await updateUserEmail(input.id, input.email);
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
        .from('teachers')
        .update({ employee_code: input.employee_code, entra_upn: input.entra_upn, entra_user_id: input.entra_user_id ?? null, department: input.department ?? null })
        .eq('id', input.id)
        .select('id')
        .single(),
    );
    await audit(supabase, 'teacher.updated', 'teachers', input.id, { ...input });
    return { message: 'Saved.' };
  },
);

export const resendTeacherInvite = formAction(
  { roles: ['admin'], schema: z.object({ id: z.string().uuid(), email: z.string().email() }), revalidate: (i) => [`/admin/teachers/${i.id}`] },
  async (input, { supabase }) => {
    await resendInvite(input.id, input.email);
    await audit(supabase, 'teacher.invite_resent', 'teachers', input.id, {});
    return { message: 'Invite / password-reset email sent.' };
  },
);

export const deleteTeacher = formAction({ roles: ['admin'], schema: z.object({ id: z.string().uuid() }), revalidate: ['/admin/teachers'] }, async (input, { supabase }) => {
  const { count } = await supabase.from('class_sessions').select('id', { count: 'exact', head: true }).eq('teacher_id', input.id);
  if (count && count > 0) {
    return { ok: false, error: `This teacher still has ${count} session(s). Reassign or cancel them first, or just deactivate the account.` };
  }
  await audit(supabase, 'teacher.deleted', 'teachers', input.id, {});
  await deleteUser(input.id);
});
