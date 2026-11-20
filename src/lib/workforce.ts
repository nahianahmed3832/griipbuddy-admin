export const workPath = '/desk/operations/work';
export const workerLabels: Record<string, string> = { 'operations-manager': 'Operations manager', 'customer-support': 'Customer support', inventory: 'Inventory', merchandising: 'Merchandising' };

export const workReasons: Record<string, string> = {
  'provider-unconfigured': 'Model provider or budget is unavailable',
  'daily-budget': 'Daily provider limit reached',
  'provider-timeout': 'Provider timed out. Response or billing may be unknown.',
  'provider-outcome-unknown': 'Previous provider submission has an unknown outcome',
  'provider-unavailable': 'Provider unavailable',
  'provider-rate-limit': 'Provider rate limit reached',
  'stock-unavailable': 'Stock evidence is unavailable',
  'stock-scope': 'Stock records do not establish a single market',
  'facts-changed': 'Source facts changed',
  'condition-cleared': 'Stock is now above the review threshold',
  'source-closed': 'Source issue closed or changed',
  'invalid-output': 'Result failed validation',
  'worker-restarted': 'Worker stopped before finishing',
  'worker-timeout': 'Task execution timed out',
  'worker-error': 'Task execution failed',
  'input-limit': 'Input exceeded the allowed size',
  'output-limit': 'Result exceeded the allowed size',
  'tool-limit': 'Task reached the tool limit',
  paused: 'Execution paused by the owner',
  cancelled: 'Cancelled by staff',
};

export type WorkRole = 'customer-support' | 'inventory' | 'merchandising';
export type WorkState = 'queued' | 'running' | 'blocked' | 'failed' | 'cancelled' | 'succeeded';
export type WorkItem = {
  _id: string; issue: string; reference: string; role: WorkRole; type: 'reply-draft' | 'restock-review' | 'merchandising-listing' | 'merchandising-launch';
  candidate?: string; market?: 'bd' | 'us';
  priority: number; priorityReason: string; nextOwner: string; state: WorkState; reason?: string; sourceEvent: string;
  reviewState: 'none' | 'awaiting' | 'approved' | 'rejected'; createdAt: string; updatedAt: string; leaseUntil?: string;
  completedAt?: string; availableAt?: string; dataAt?: string; revision: number; generation: number; tries: number;
  totalAttempts: number; result?: string; variant?: string; product?: string;
};
export type WorkQueue = {
  tasks: WorkItem[]; overflow: boolean;
  counts: { _id: { state: WorkState; review: string; role: WorkRole }; count: number }[];
  runner: { available: boolean; heartbeat?: string; lastHealthy?: string; issue?: string; pollMs: number;
    paused: boolean; roles: WorkRole[]; revision?: number };
  provider: { available: boolean; dependency?: string; model?: string };
  merchandising?: boolean;
  limits?: { parallel: number; support: number; inventory: number; merchandising: number; attempts: number; revisions: number;
    timeoutMs: number; inputBytes: number; outputTokens: number; outputBytes: number; toolCalls: number; dailyRequests: number };
  budget?: number;
  usage?: { _id: WorkRole; attempts: number; inputTokens: number; outputTokens: number; metered: number }[];
};
export type Rule = { version: number; target: number; supplier: string; termsReference: string;
  demandReference: string; validThrough: string; reviewedAt: string };
export type WorkOutput = {
  type: WorkItem['type']; draft?: string; category?: string | null; orderStatus?: string; trackingStatus?: string;
  focus?: number[]; collections?: string[];
  next?: string[]; escalation?: string[]; gaps: string[]; sources: string[];
  stock?: { onHand: number; reserved: number; unavailable: number; sellable: number };
  threshold?: number; incoming?: number | null; incomingPurchaseCount?: number;
  target?: number | null; recommended?: number | null; explanation?: string; assumptions?: string[];
  termsReference?: string; demandReference?: string;
};
export type WorkDetail = WorkItem & {
  latest?: { output: WorkOutput; method: string; cutoff: string; dataVersion: string; sources: string[] };
  attempts: { _id: string; sequence: number; status: string; method: string; model?: string; error?: string;
    providerOutcome?: string; startedAt: string; finishedAt?: string; usage?: { inputTokens: number; outputTokens: number };
    cutoff?: string; dataVersion?: string; sourceVersions?: Record<string, unknown> }[];
  activity: { action: string; at: string; reason?: string; worker?: string; actor?: string }[];
  paused: boolean;
  review?: { draft?: string; state: string; actor: string; at: string; attempt: string; inputVersion: string; reason?: string };
  reviewHistory: { draft?: string; output?: WorkOutput; state: string; actor: string; at: string; attempt: string; inputVersion: string; reason?: string }[];
  origin?: { status: string; observed: boolean; assignee?: string };
  purchase?: { _id: string; reference: string };
  outcome?: { status: string; records: { kind: string; at: string; reference: string; verifiedSource?: string;
    evidenceType?: 'supplier-report' | 'supplier-document' | 'warehouse-count' }[] };
  freshness: 'current' | 'changed' | 'unavailable'; rule?: Rule;
};

export function workStatus(task: WorkItem) {
  if (task.state !== 'succeeded') return task.state;
  if (task.role === 'merchandising') return 'Proposal ready';
  return { awaiting: 'Awaiting review', approved: 'Approved', rejected: 'Rejected', none: 'Result saved' }[task.reviewState];
}
