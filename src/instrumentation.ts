import type { Instrumentation } from 'next';

/** Next.js 15 server error hook → structured log + optional webhook (src/lib/monitoring.ts). */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { reportError } = await import('@/lib/monitoring');
  reportError('server', error, { path: request.path, method: request.method, routerKind: context.routerKind, routeType: context.routeType });
};
