import { MockGraphClient } from './mock.ts';
import { RealGraphClient, type RealGraphOptions } from './real.ts';
import type { GraphCallLog, GraphClient, GraphConfig } from './types.ts';

export * from './types.ts';
export { MockGraphClient } from './mock.ts';
export { RealGraphClient } from './real.ts';

export interface GraphEnv {
  GRAPH_MODE?: string;
  MS_TENANT_ID?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  MS_SERVICE_ACCOUNT_USER_ID?: string;
  MS_SERVICE_ACCOUNT_UPN?: string;
}

const isPlaceholder = (v: string | undefined) => !v || v.startsWith('REPLACE') || v.startsWith('your_');

/** True when every Microsoft value needed for the real client is present. */
export function hasRealGraphCredentials(env: GraphEnv): boolean {
  return ![env.MS_TENANT_ID, env.MS_CLIENT_ID, env.MS_CLIENT_SECRET, env.MS_SERVICE_ACCOUNT_USER_ID, env.MS_SERVICE_ACCOUNT_UPN].some(isPlaceholder);
}

export function graphConfigFromEnv(env: GraphEnv): GraphConfig {
  if (!hasRealGraphCredentials(env)) throw new Error('Microsoft Graph credentials are missing (MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_SERVICE_ACCOUNT_USER_ID, MS_SERVICE_ACCOUNT_UPN)');
  return {
    tenantId: env.MS_TENANT_ID!,
    clientId: env.MS_CLIENT_ID!,
    clientSecret: env.MS_CLIENT_SECRET!,
    serviceAccountUserId: env.MS_SERVICE_ACCOUNT_USER_ID!,
    serviceAccountUpn: env.MS_SERVICE_ACCOUNT_UPN!,
  };
}

/**
 * Pick the client from GRAPH_MODE: "real" needs credentials; anything else (or missing
 * credentials with mode unset) yields the mock. GRAPH_MODE=real without credentials throws,
 * so a misconfigured production never silently runs on the mock.
 */
export function createGraphClient(env: GraphEnv, opts: { onCall?: (log: GraphCallLog) => void | Promise<void> } & RealGraphOptions = {}): GraphClient {
  const mode = (env.GRAPH_MODE ?? '').toLowerCase();
  if (mode === 'real') return new RealGraphClient(graphConfigFromEnv(env), opts);
  if (mode === 'mock' || mode === '') return new MockGraphClient(opts.onCall);
  throw new Error(`Unknown GRAPH_MODE "${env.GRAPH_MODE}" (expected real|mock)`);
}
