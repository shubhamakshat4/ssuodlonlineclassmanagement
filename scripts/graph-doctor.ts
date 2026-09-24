/** Diagnose the tenant setup: licences, calendar event shape, direct onlineMeetings access. */
import './_env';
import type { GraphEnv } from '../supabase/functions/_shared/graph/index.ts';

const env = process.env as GraphEnv & NodeJS.ProcessEnv;
const SA = env.MS_SERVICE_ACCOUNT_USER_ID!;

async function token() {
  const r = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.MS_CLIENT_ID!, client_secret: env.MS_CLIENT_SECRET!, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  return (await r.json()).access_token as string;
}
async function api(t: string, method: string, path: string, body?: unknown) {
  const r = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json: unknown = text;
  try { json = JSON.parse(text); } catch { /* text */ }
  return { status: r.status, json: json as Record<string, unknown> };
}

(async () => {
  const t = await token();
  const sa = await api(t, 'GET', `/users/${SA}?$select=id,displayName,userPrincipalName,mail,assignedLicenses,assignedPlans,accountEnabled,usageLocation`);
  const plans = ((sa.json.assignedPlans as { service: string; capabilityStatus: string }[] | undefined) ?? []).filter((p) => /teams|MicrosoftOffice|SharePoint/i.test(p.service));
  console.log('SERVICE ACCOUNT', sa.status, JSON.stringify({
    upn: sa.json.userPrincipalName, mail: sa.json.mail, enabled: sa.json.accountEnabled, usageLocation: sa.json.usageLocation,
    licenceCount: ((sa.json.assignedLicenses as unknown[]) ?? []).length,
    teamsPlans: plans.map((p) => `${p.service}:${p.capabilityStatus}`),
  }, null, 1));

  // Does a direct online meeting work? (this is the real test of Teams + application access policy)
  const om = await api(t, 'POST', `/users/${SA}/onlineMeetings`, { subject: '[TEST] doctor probe', startDateTime: new Date(Date.now() + 3600e3).toISOString(), endDateTime: new Date(Date.now() + 5400e3).toISOString() });
  console.log('\nPOST /onlineMeetings ->', om.status, JSON.stringify(om.json).slice(0, 400));
  if (om.status === 201 && om.json.id) await api(t, 'DELETE', `/users/${SA}/onlineMeetings/${om.json.id}`);

  // Look at recent [TEST] calendar events and clean them up
  const ev = await api(t, 'GET', `/users/${SA}/events?$select=id,subject,isOnlineMeeting,onlineMeetingProvider,onlineMeeting,createdDateTime&$top=10&$orderby=createdDateTime desc`);
  const items = ((ev.json.value as Record<string, unknown>[]) ?? []);
  console.log('\nRECENT EVENTS', ev.status);
  for (const e of items) console.log(' -', e.createdDateTime, '|', e.subject, '| isOnlineMeeting=', e.isOnlineMeeting, '| provider=', e.onlineMeetingProvider, '| joinUrl=', (e.onlineMeeting as { joinUrl?: string } | null)?.joinUrl ?? 'NONE');
  for (const e of items) {
    if (typeof e.subject === 'string' && e.subject.includes('[TEST]')) {
      const d = await api(t, 'DELETE', `/users/${SA}/events/${e.id}`);
      console.log('   cleaned up:', e.subject, d.status);
    }
  }
})();
