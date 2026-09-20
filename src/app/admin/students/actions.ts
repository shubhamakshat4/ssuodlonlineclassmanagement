'use server';

import { z } from 'zod';
import { ActionError, audit, formAction, must } from '@/lib/actions';
import { provisionUser, deleteUser, updateUserEmail } from '@/lib/admin/provision';
import { parseCsvObjects } from '@/lib/domain/csv';
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
    must(await supabase.from('students').update({ roll_number: input.roll_number, batch_id: input.batch_id, status: input.status }).eq('id', input.id).select('id').single());
    await audit(supabase, 'student.updated', 'students', input.id, { ...input });
    return { message: 'Saved.' };
  },
);

export const deleteStudent = formAction({ roles: ['admin'], schema: z.object({ id: z.string().uuid() }), revalidate: ['/admin/students'] }, async (input, { supabase }) => {
  await audit(supabase, 'student.deleted', 'students', input.id, {});
  await deleteUser(input.id);
});

// ---------------------------------------------------------------------------
// Bulk CSV import. Header: roll_number,full_name,email,phone,batch_code,status
// Per-row processing with a report; rows that fail do not block the others.
// ---------------------------------------------------------------------------
export const importStudents = formAction(
  { roles: ['admin'], schema: z.object({ csv: z.string().min(1, 'Paste CSV or choose a file.'), default_batch_id: z.string().uuid().optional() }), revalidate: ['/admin/students'] },
  async (input, { supabase }) => {
    const { headers, rows } = parseCsvObjects(input.csv);
    for (const required of ['roll_number', 'full_name', 'email']) {
      if (!headers.includes(required)) throw new ActionError(`CSV is missing the "${required}" column. Expected: roll_number,full_name,email,phone,batch_code,status`);
    }
    const batches = must(await supabase.from('batches').select('id, code')) as { id: string; code: string }[];
    const batchByCode = new Map(batches.map((b) => [b.code.toUpperCase(), b.id]));

    const report = { created: 0, skipped: 0, errors: [] as string[] };
    for (const [i, r] of rows.entries()) {
      const line = i + 2;
      const parsed = createSchema.safeParse({
        full_name: r.full_name,
        email: r.email,
        phone: r.phone || undefined,
        roll_number: r.roll_number,
        batch_id: r.batch_code ? batchByCode.get(r.batch_code.toUpperCase()) : input.default_batch_id,
        status: r.status || 'active',
      });
      if (!parsed.success) {
        report.errors.push(`Line ${line}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
        continue;
      }
      const { data: existing } = await supabase.from('profiles').select('id').eq('email', parsed.data.email).maybeSingle();
      if (existing) {
        report.skipped++;
        continue;
      }
      try {
        const userId = await provisionUser({ email: parsed.data.email, fullName: parsed.data.full_name, phone: parsed.data.phone, role: 'student' });
        const { error } = await supabase
          .from('students')
          .insert({ id: userId, roll_number: parsed.data.roll_number, batch_id: parsed.data.batch_id, status: parsed.data.status });
        if (error) {
          await deleteUser(userId);
          throw error;
        }
        report.created++;
      } catch (e) {
        report.errors.push(`Line ${line} (${parsed.data.email}): ${(e as Error).message}`);
      }
    }
    await audit(supabase, 'student.bulk_import', 'students', null, report);
    return {
      message: `Imported ${report.created} student(s); skipped ${report.skipped} existing; ${report.errors.length} error(s).`,
      data: report,
      error: report.errors.length ? report.errors.slice(0, 20).join('\n') : undefined,
    };
  },
);
