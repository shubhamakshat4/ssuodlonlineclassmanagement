import { Badge } from '@/components/ui/primitives';
import type { SessionStatus, SyncStatus } from '@/lib/db/types';

export function StatusBadge({ status }: { status: SessionStatus }) {
  const variant = status === 'scheduled' ? 'info' : status === 'completed' ? 'secondary' : 'destructive';
  return <Badge variant={variant}>{status}</Badge>;
}

export function SyncBadge({ sync, provider }: { sync: SyncStatus; provider?: 'teams' | 'custom' }) {
  if (provider === 'custom') return <Badge variant="warning">custom link</Badge>;
  const variant = sync === 'provisioned' ? 'success' : sync === 'failed' ? 'destructive' : sync === 'cancelled' ? 'secondary' : 'outline';
  return <Badge variant={variant}>{sync === 'provisioned' ? 'Teams ready' : sync}</Badge>;
}
