import { CsvImportCard } from '@/components/csv-import-card';
import { Alert, PageHeader } from '@/components/ui/primitives';
import { SPECS } from '@/lib/admin/csv-specs';

export const metadata = { title: 'CSV import — Admin' };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Import from CSV"
        description="Set up a programme end to end from spreadsheets. Each section has a sample template, the exact columns, and the rules applied to every row."
      />
      <Alert variant="info" className="mb-6">
        <p className="font-medium">Recommended order</p>
        <p className="mt-1">
          {SPECS.map((s, i) => (
            <span key={s.key}>
              {i + 1}. {s.title}
              {i < SPECS.length - 1 ? ' → ' : ''}
            </span>
          ))}
        </p>
        <p className="mt-1">Each step refers to codes from the previous ones (programme code → batch code → subject code → teacher email). Re-importing the same file is safe: existing rows are updated or skipped, never duplicated.</p>
      </Alert>
      <div className="grid gap-4">
        {SPECS.map((s, i) => (
          <div key={s.key} id={s.key}>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Step {i + 1}</div>
            <CsvImportCard entity={s.key} open={i === 0} />
          </div>
        ))}
      </div>
    </>
  );
}
