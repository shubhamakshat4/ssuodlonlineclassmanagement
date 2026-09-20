import { Badge, Card, CardContent, EmptyState, PageHeader } from '@/components/ui/primitives';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import type { TimetableSlot } from '@/lib/db/types';
import { DAY_SHORT, hhmm } from '@/lib/domain/time';

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

type SlotRow = TimetableSlot & { batch_subjects: { batches: { code: string }; subjects: { code: string; name: string } } };

export default async function TeacherTimetablePage() {
  const user = await requireRole('teacher');
  const supabase = await createClient();
  const { data } = await supabase
    .from('timetable_slots')
    .select('*, batch_subjects!inner(batches!inner(code), subjects!inner(code, name))')
    .eq('teacher_id', user.id)
    .eq('is_active', true)
    .order('start_time');
  const slots = (data ?? []) as unknown as SlotRow[];

  return (
    <>
      <PageHeader title="Weekly timetable" description="Your recurring slots (IST). Actual sessions, holidays and one-off classes are on the Today and Upcoming pages." />
      {slots.length === 0 ? (
        <EmptyState>No timetable slots assigned to you yet.</EmptyState>
      ) : (
        <Card>
          <CardContent className="pt-5">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
              {DAY_ORDER.map((d) => (
                <div key={d} className="rounded-md border border-border p-2">
                  <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{DAY_SHORT[d]}</div>
                  <div className="grid gap-2">
                    {slots
                      .filter((s) => s.day_of_week === d)
                      .map((s) => (
                        <div key={s.id} className="rounded border border-primary/30 bg-primary/5 p-2 text-xs">
                          <div className="font-mono">
                            {hhmm(s.start_time)}–{hhmm(s.end_time)}
                          </div>
                          <div className="font-medium">
                            {s.batch_subjects.subjects.code} {s.batch_subjects.subjects.name}
                          </div>
                          <Badge variant="outline">{s.batch_subjects.batches.code}</Badge>
                          {s.effective_to ? <div className="mt-1 text-muted-foreground">until {s.effective_to}</div> : null}
                        </div>
                      ))}
                    {slots.filter((s) => s.day_of_week === d).length === 0 ? <div className="text-xs text-muted-foreground">—</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
