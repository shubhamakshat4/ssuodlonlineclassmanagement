import { Download, FileSpreadsheet } from 'lucide-react';
import { ActionForm } from '@/components/action-form';
import { Card, CardContent, CardDescription, CardTitle, Field, Input, Textarea } from '@/components/ui/primitives';
import { importCsv } from '@/app/admin/import/actions';
import { SPECS, templateCsv, type EntityKey } from '@/lib/admin/csv-specs';

/**
 * CSV import for one admin entity: template download, column instructions, file upload or paste,
 * per-row result report. Used on every admin list page (collapsed) and on /admin/import (open).
 */
export function CsvImportCard({ entity, open = false }: { entity: EntityKey; open?: boolean }) {
  const spec = SPECS.find((s) => s.key === entity)!;
  const header = spec.columns.map((c) => c.name).join(',');
  const sample = templateCsv(spec).trim();
  return (
    <Card>
      <details open={open} className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 p-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <FileSpreadsheet className="h-4.5 w-4.5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <CardTitle>Import {spec.title.toLowerCase()} from CSV</CardTitle>
            <CardDescription>{spec.summary}</CardDescription>
          </span>
          <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
          <span className="hidden text-xs text-muted-foreground group-open:inline">Hide</span>
        </summary>
        <CardContent className="grid gap-5 border-t border-border pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`/admin/import/template/${spec.key}`}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-sm font-medium shadow-sm hover:border-primary/40 hover:bg-primary-soft/60"
              download
            >
              <Download className="h-4 w-4" aria-hidden />
              Download sample template
            </a>
            <span className="text-xs text-muted-foreground">
              Matched on <span className="font-mono">{spec.matchOn}</span>
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Columns</h4>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <tbody>
                    {spec.columns.map((c) => (
                      <tr key={c.name} className="border-b border-border last:border-0">
                        <td className="whitespace-nowrap px-3 py-1.5 align-top font-mono text-xs">
                          {c.name}
                          {c.required ? <span className="text-destructive"> *</span> : null}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">{c.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">* required · header row must be the first line · UTF-8 · columns may be in any order</p>
            </div>
            <div>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rules</h4>
              <ul className="grid gap-1.5 text-sm text-muted-foreground">
                {spec.notes.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    {n}
                  </li>
                ))}
                <li className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  Rows with problems are reported by line number and do not stop the other rows.
                </li>
              </ul>
              <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sample</h4>
              <pre className="overflow-x-auto rounded-lg bg-surface-muted p-3 font-mono text-[11px] leading-relaxed text-foreground/80">{sample}</pre>
            </div>
          </div>

          <ActionForm action={importCsv} submitLabel={`Import ${spec.title.toLowerCase()}`} pendingLabel="Importing…">
            <input type="hidden" name="entity" value={spec.key} />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="CSV file" htmlFor={`file-${spec.key}`} hint="Exported from Excel / Google Sheets as CSV (UTF-8).">
                <Input id={`file-${spec.key}`} name="file" type="file" accept=".csv,text/csv" className="file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-xs file:font-medium" />
              </Field>
              <Field label="…or paste CSV text" htmlFor={`csv-${spec.key}`}>
                <Textarea id={`csv-${spec.key}`} name="csv" rows={4} className="font-mono text-xs" placeholder={header} />
              </Field>
            </div>
          </ActionForm>
        </CardContent>
      </details>
    </Card>
  );
}
