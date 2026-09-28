/**
 * Ask the tenant whether an address is a usable Microsoft 365 account for a co-organiser.
 *
 *   npm run graph:check-users -- a@srisriuniversity.edu.in b@example.com
 *   npm run graph:check-users                # checks every teachers.entra_upn in the database
 *
 * For each address it reports whether the tenant knows it, whether the account is enabled, and whether
 * it has a licence with a Teams plan. A Teams meeting can only name a co-organiser from the same tenant,
 * so an address outside srisriuniversity.edu.in will not work however many licences it has elsewhere.
 */
import './_env';
import { createClient } from '@supabase/supabase-js';
import type { GraphEnv } from '../supabase/functions/_shared/graph/index.ts';

const env = process.env as GraphEnv & NodeJS.ProcessEnv;

async function token(): Promise<string> {
  const r = await fetch(`https://login.microsoftonline.com/${env.MS_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.MS_CLIENT_ID!,
      client_secret: env.MS_CLIENT_SECRET!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const j = (await r.json()) as { access_token?: string; error_description?: string };
  if (!j.access_token) throw new Error(`could not get a Graph token: ${j.error_description ?? 'unknown error'}`);
  return j.access_token;
}

interface GraphUser {
  id?: string;
  displayName?: string;
  userPrincipalName?: string;
  mail?: string;
  accountEnabled?: boolean;
  userType?: string;
  assignedPlans?: { service?: string; capabilityStatus?: string }[];
  error?: { message?: string };
}

async function lookup(t: string, address: string): Promise<GraphUser> {
  const r = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(address)}?$select=id,displayName,userPrincipalName,mail,accountEnabled,userType,assignedPlans`,
    { headers: { Authorization: `Bearer ${t}` } },
  );
  return (await r.json()) as GraphUser;
}

async function addresses(): Promise<string[]> {
  const given = process.argv.slice(2).filter((a) => a.includes('@'));
  if (given.length) return given;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('pass addresses on the command line, or set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data } = await admin.from('teachers').select('entra_upn').order('employee_code');
  return ((data ?? []) as { entra_upn: string }[]).map((t) => t.entra_upn);
}

async function main() {
  const list = await addresses();
  const t = await token();
  let usable = 0;
  console.log(`checking ${list.length} address(es) against tenant ${env.MS_TENANT_ID}\n`);
  for (const address of list) {
    const u = await lookup(t, address);
    if (!u.id) {
      console.log(`  NOT IN TENANT  ${address}`);
      console.log(`                 ${u.error?.message?.split('\n')[0] ?? 'no account with that address'}`);
      continue;
    }
    const teams = (u.assignedPlans ?? []).some((p) => /teams/i.test(p.service ?? '') && p.capabilityStatus === 'Enabled');
    const guest = u.userType === 'Guest';
    const ok = Boolean(u.accountEnabled) && teams && !guest;
    if (ok) usable += 1;
    console.log(`  ${ok ? 'OK           ' : 'NOT USABLE   '}${address}`);
    console.log(
      `                 ${u.displayName ?? '?'} | upn ${u.userPrincipalName ?? '?'} | ${u.accountEnabled ? 'enabled' : 'DISABLED'} | ${
        teams ? 'Teams licence' : 'NO Teams plan'
      }${guest ? ' | GUEST account' : ''}`,
    );
  }
  console.log(`\n${usable} of ${list.length} can be named as a co-organiser.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
