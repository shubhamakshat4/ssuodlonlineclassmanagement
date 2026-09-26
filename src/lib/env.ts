/**
 * Typed access to environment variables.
 *
 * - `publicEnv` is safe to import anywhere (values are inlined into the client bundle by Next.js).
 * - `serverEnv()` must only be called from server code. It throws if a required server-only
 *   variable is missing so misconfiguration fails loudly at startup rather than at request time.
 *
 * Microsoft Graph credentials are intentionally NOT exposed here: the Next.js app never calls
 * Graph. They live only in Edge Function secrets (see supabase/functions/_shared/env.ts).
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.startsWith('REPLACE')) {
    throw new Error(`Missing required environment variable ${name}. See .env.local.example.`);
  }
  return value;
}

function intWithDefault(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const appConfig = {
  timezone: process.env.APP_TIMEZONE ?? 'Asia/Kolkata',
  allowedStudentDomain: process.env.ALLOWED_STUDENT_DOMAIN ?? 'srisriuniversity.edu.in',
  joinWindowLeadMinutes: intWithDefault(process.env.JOIN_WINDOW_LEAD_MINUTES, 10),
  recordingRetentionDays: intWithDefault(process.env.RECORDING_RETENTION_DAYS, 30),
  sessionGenerationHorizonDays: intWithDefault(process.env.SESSION_GENERATION_HORIZON_DAYS, 21),
  /** First-login password the ODL office hands to a student. They must change it before anything else. */
  studentDefaultPassword: process.env.STUDENT_DEFAULT_PASSWORD ?? 'srisri@26',
};

export function serverEnv() {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must not be called in the browser');
  }
  return {
    supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY', process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
