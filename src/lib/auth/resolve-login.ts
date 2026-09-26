import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * A student may type either of their addresses. Supabase Auth holds one email per account, so the
 * college address and the personal address cannot both be login identities; instead we translate what
 * was typed into the one the account actually uses, before going anywhere near GoTrue.
 *
 * That keeps it a single account with a single password — the same password works from either address
 * because there is only ever one — and it means no second auth user to keep in step.
 *
 * Returns the canonical address, or the typed one unchanged when nothing matches, so a wrong address
 * fails as an ordinary bad sign-in rather than telling the caller whether the account exists.
 */
export async function resolveLoginEmail(typed: string): Promise<{ email: string; ambiguous?: true }> {
  const email = typed.trim().toLowerCase();
  if (!email) return { email };

  const admin = createAdminClient();

  // The common case: what they typed is already the login.
  const { data: profile } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (profile) return { email };

  // Otherwise it may be the other address on a student record. Two queries rather than .or(), because
  // an address can contain a comma and PostgREST's or() filter is a comma-separated string.
  const match = async (column: 'college_email' | 'personal_email') => {
    const { data } = await admin.from('students').select('id, profiles!inner(email)').eq(column, email).limit(2);
    return (data ?? []) as unknown as { id: string; profiles: { email: string } }[];
  };
  const hits = [...(await match('college_email')), ...(await match('personal_email'))];
  const logins = [...new Set(hits.map((h) => h.profiles.email.toLowerCase()))];

  // Personal addresses are not unique in the data (siblings could share one), so refuse rather than
  // guess which account was meant.
  if (logins.length > 1) return { email, ambiguous: true };
  return { email: logins[0] ?? email };
}
