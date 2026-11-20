import { adminPath } from '@/lib/paths';
import { counterScopeFields, type CounterScope } from '@/lib/counter-pos-contract';

export class CounterRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function counterApiUrl(action: string, scope?: CounterScope, other?: Record<string, string>) {
  return adminPath('/api/pos') + '?' + new URLSearchParams({ action, ...(scope && counterScopeFields(scope)), ...other });
}

async function data<T>(response: Response): Promise<T> {
  if (!response.ok) throw new CounterRequestError((await response.text()).slice(0, 420) || 'The counter could not complete the request.', response.status);
  return response.json() as Promise<T>;
}

export async function counterRead<T>(action: string, scope?: CounterScope, other?: Record<string, string>, signal?: AbortSignal) {
  return data<T>(await fetch(counterApiUrl(action, scope, other), { cache: 'no-store', signal }));
}

export async function counterWrite<T>(action: string, values: Record<string, unknown>) {
  return data<T>(await fetch(adminPath('/api/pos'), {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, values }),
  }));
}

export function counterError(error: unknown) {
  return error instanceof CounterRequestError ? error.message : 'The connection was interrupted. Try checking the counter service again.';
}
