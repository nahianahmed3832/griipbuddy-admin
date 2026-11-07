import { ApiError } from './api';
import { managedProfile } from './managed';

export type MarketSettings = { cod: boolean; manual: { advancePercent: number } | null; paypal: boolean; stripe: boolean; shipping: number | null };
export type CheckoutSnapshot = {
  preferences: { revision: number; fallback: string; markets: Record<'BD'|'US', MarketSettings> };
  providers: { paypal: boolean; stripe: boolean };
  queue: { id: string; number: string; market: string; currency: string; advanceDue: number; status: string; createdAt: string }[];
  history: { actor: string; action: string; target: string; created_at: string }[];
};

export async function checkoutRequest(receipt?: string, body?: unknown, metadata = false) {
  if (managedProfile()) throw new ApiError(404, 'The managed checkout workspace uses the commerce API.');
  const key = process.env.GRIIP_ADMIN_CHECKOUT_KEY;
  if (!key || key.length < 32) throw new ApiError(503,'Checkout sandbox is disconnected.');
  const path = '/api/checkout/admin' + (receipt ? '?receipt='+encodeURIComponent(receipt)+(metadata ? '&format=metadata' : '') : '');
  try {
    const port = process.env.GRIIP_ADMIN_CHECKOUT_TARGET === 'fixture' ? 4326 : 4317;
    return await fetch('http://127.0.0.1:'+port+path, {
      headers: { Authorization:'Bearer '+key, ...(body ? {'Content-Type':'application/json'} : {}) },
      ...(body ? {method:'POST',body:JSON.stringify(body)} : {}), redirect:'error', cache:'no-store', signal:AbortSignal.timeout(6000),
    });
  } catch {
    throw new ApiError(503,'Checkout sandbox is unavailable.');
  }
}
