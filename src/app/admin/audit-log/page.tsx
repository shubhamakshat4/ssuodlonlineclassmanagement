import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, Field, Input, PageHeader, Select, Table, TBody, TD, TH, THead, TR } from '@/components/ui/primitives';
import { createClient } from '@/lib/supabase/server';
import type { AuditLog, Profile } from '@/lib/db/types';
import { formatIst } from '@/lib/domain/time';

export const metadata = { title: 'Audit log — Admin' };
export const dynamic = 'force-dynamic';

const PAGE = 100;
const ACTION_GROUPS = ['session.', 'graph.', 'provisioner.', 'sessions.', 'recording.', 'recordings.', 'harvester.', 'student.', 'teacher.', 'batch', 'program.', 'subject', 'timetable_slot.', 'holiday.', 'auth.', 'attendance.'];

interface Params {
  action?: string;
  entity?: string;
  entity_id?: string;
  actor?: string;
  before?: string;
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const supabase = await createClient();
  let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(PAGE);
  if (p.action) q = q.ilike('action', `${p.action}%`);
  if (p.entity) q = q.eq('entity', p.entity);
  if (p.entity_id && /^[0-9a-f-]{36}$/i.test(p.entity_id)) q = q.eq('entity_id', p.entity_id);
  if (p.actor && /^[0-9a-f-]{36}$/i.test(p.actor)) q = q.eq('actor_id', p.actor);
  if (p.before) q = q.lt('created_at', p.before);
  const [{ data: rows }, { data: profiles }] = await Promise.all([q, supabase.from('profiles').select('id, full_name, role')]);
  const entries = (rows ?? []) as AuditLog[];
  const nameById = new Map(((profiles ?? []) as Pick<Profile, 'id' | 'full_name' | 'role'>[]).map((x) => [x.id, x]));
  const last = entries[entries.length - 1];
  const nextParams = new URLSearchParams({ ...(p.action ? { action: p.action } : {}), ...(p.entity ? { entity: p.entity } : {}), ...(p.entity_id ? { entity_id: p.entity_id } : {}), ...(p.actor ? { actor: p.actor } : {}) });
  if (last) nextParams.set('before', last.created_at);

  return (
    <>
      <PageHeader eyebrow="Administration" title="Audit log" description="Every admin/teacher change, every Graph call, every playback. Newest first, 100 per page." />
      <Card className="mb-6">
        <CardContent className="pt-5">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <Field label="Action starts with" htmlFor="action">
              <Select id="action" name="action" defaultValue={p.action ?? ''} className="w-48">
                <option value="">Any</option>
                {ACTION_GROUPS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Entity" htmlFor="entity">
              <Input id="entity" name="entity" defaultValue={p.entity ?? ''} placeholder="class_sessions" className="w-44" />
            </Field>
            <Field label="Entity id" htmlFor="entity_id">
              <Input id="entity_id" name="entity_id" defaultValue={p.entity_id ?? ''} className="w-80 font-mono" />
            </Field>
            <Field label="Actor id" htmlFor="actor">
              <Input id="actor" name="actor" defaultValue={p.actor ?? ''} className="w-80 font-mono" />
            </Field>
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5">
          <Table>
            <THead>
              <TR>
                <TH>At (IST)</TH>
                <TH>Actor</TH>
                <TH>Action</TH>
                <TH>Entity</TH>
                <TH>Payload</TH>
              </TR>
            </THead>
            <TBody>
              {entries.map((e) => {
                const actor = e.actor_id ? nameById.get(e.actor_id) : null;
                return (
                  <TR key={e.id}>
                    <TD className="whitespace-nowrap align-top">{formatIst(e.created_at)}</TD>
                    <TD className="align-top">
                      {actor ? (
                        <>
                          {actor.full_name} <Badge variant="outline">{actor.role}</Badge>
                        </>
                      ) : (
                        <Badge variant="secondary">system</Badge>
                      )}
                    </TD>
                    <TD className="align-top font-mono text-xs">{e.action}</TD>
                    <TD className="align-top font-mono text-xs">
                      {e.entity}
                      {e.entity_id ? (
                        <>
                          <br />
                          <Link href={`/admin/audit-log?entity_id=${e.entity_id}`} className="text-primary underline">
                            {e.entity_id.slice(0, 8)}…
                          </Link>
                        </>
                      ) : null}
                    </TD>
                    <TD className="align-top">
                      <details>
                        <summary className="cursor-pointer text-xs text-muted-foreground">{summarise(e.payload)}</summary>
                        <pre className="mt-1 max-w-xl overflow-x-auto rounded bg-muted p-2 text-xs">{JSON.stringify(e.payload, null, 2)}</pre>
                      </details>
                    </TD>
                  </TR>
                );
              })}
              {entries.length === 0 ? (
                <TR>
                  <TD colSpan={5} className="text-muted-foreground">
                    No entries.
                  </TD>
                </TR>
              ) : null}
            </TBody>
          </Table>
          {entries.length === PAGE ? (
            <div className="mt-4">
              <Link href={`/admin/audit-log?${nextParams.toString()}`} className="text-sm text-primary underline">
                Older entries →
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}

function summarise(payload: Record<string, unknown>): string {
  const keys = Object.keys(payload);
  if (keys.length === 0) return '—';
  const preferred = ['endpoint', 'status', 'error', 'join_url_override', 'code', 'roll_number', 'count', 'inserted', 'provisioned'];
  const parts = preferred.filter((k) => k in payload).map((k) => `${k}=${String(payload[k]).slice(0, 60)}`);
  return (parts.length ? parts : keys.slice(0, 3).map((k) => `${k}=${String(payload[k]).slice(0, 40)}`)).join(' · ');
}
