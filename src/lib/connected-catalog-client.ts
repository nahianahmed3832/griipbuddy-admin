import type { CatalogRequest } from './connected-catalog-contract';
import { adminPath } from './paths';
import type { Region } from './sections';

export class CatalogRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export const catalogBeforeRegionChange = 'griip-catalog-before-region-change';

export async function catalogRequest<T = unknown>(request: CatalogRequest, region: Region, signal?: AbortSignal) {
  const response = await fetch(adminPath('/api/connected-catalog'), { method: 'POST', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ region, request }) });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || !Object.hasOwn(payload, 'data')) {
    throw new CatalogRequestError(typeof payload?.error === 'string' ? payload.error : 'The connected catalog is unavailable. Try again.', response.status);
  }
  return payload.data as T;
}
