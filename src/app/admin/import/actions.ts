'use server';

import { z } from 'zod';
import { ActionError, audit, formAction } from '@/lib/actions';
import { runCsvImport } from '@/lib/admin/csv-import';
import { SPECS } from '@/lib/admin/csv-specs';

const ENTITY_KEYS = SPECS.map((s) => s.key) as [string, ...string[]];

const schema = z.object({
  entity: z.enum(ENTITY_KEYS),
  csv: z.string().optional(),
  file: z.any().optional(),
});

const REVALIDATE = ['/admin', '/admin/import', '/admin/programs', '/admin/batches', '/admin/subjects', '/admin/students', '/admin/teachers', '/admin/timetable', '/admin/holidays', '/admin/sessions', '/student', '/teacher'];

/** One action for every entity: reads the uploaded file (preferred) or the pasted text. */
export const importCsv = formAction({ roles: ['admin'], schema, revalidate: REVALIDATE }, async (input, { supabase, user }) => {
  let text = '';
  const file = input.file as unknown;
  if (file && typeof file === 'object' && 'size' in file && typeof (file as File).text === 'function' && (file as File).size > 0) {
    if ((file as File).size > 2_000_000) throw new ActionError('File is larger than 2 MB. Split it into smaller files.');
    text = await (file as File).text();
  } else if (input.csv?.trim()) {
    text = input.csv;
  } else {
    throw new ActionError('Choose a CSV file or paste CSV text.', { csv: 'required' });
  }

  const entity = input.entity as (typeof SPECS)[number]['key'];
  const report = await runCsvImport(supabase, entity, text);
  await audit(supabase, `${entity}.csv_import`, entity, null, { by: user.id, ...report, errors: report.errors.slice(0, 50) });

  const parts = [`${report.created} created`, report.updated ? `${report.updated} updated` : '', report.skipped ? `${report.skipped} skipped (already present)` : '', report.errors.length ? `${report.errors.length} row(s) with problems` : ''].filter(Boolean);
  return {
    message: `${report.total} row(s) read: ${parts.join(', ')}.`,
    error: report.errors.length ? report.errors.slice(0, 25).map((e) => `Line ${e.line}: ${e.message}`).join('\n') + (report.errors.length > 25 ? `\n… and ${report.errors.length - 25} more` : '') : undefined,
    data: { ...report },
  };
});
