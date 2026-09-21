import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth/session';
import { specFor, templateCsv } from '@/lib/admin/csv-specs';

/** GET /admin/import/template/{entity} → downloadable sample CSV with the exact header row. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ entity: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { entity } = await params;
  const spec = specFor(entity);
  if (!spec) return NextResponse.json({ error: 'Unknown template' }, { status: 404 });
  return new NextResponse(templateCsv(spec), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ssu-odl-${spec.key}-template.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
