import 'server-only';
import { api, ApiError, mongoId, type Session, url } from './api';
import { has, type Region } from './sections';

export const recoveredStockPath = '/physical-inventory';
export const recoveredStockPage = '/dashboard/inventory/physical-stock';
export type StockLocation = { id: string; name: string; region: Region; country: string | null; type: string };
export type StockRow = { id: string; variant: string; product: string; sku: string | null; name: string; location: string; owner: string;
  onHand: number; unavailable: number; usable: number; threshold: number | null; thresholdRevision: string | null; low: boolean;
  pool?: { onHand: number; reserved: number; unavailable: number; available: number } | null };
export type StockLot = { id: string; number: string; bin: string | null; quantity: number; status: string; expiresAt: string | null; usable?: boolean; unitCost?: number };
export type StockDetail = { stock: StockRow; lots: StockLot[]; nextMovement?: string | null; movements: {
  id: string; type?: string | null; quantity?: number | null; lot: string | null; from: string | null; to: string | null;
  reference: string | null; actor: string | null; reason: string | null; at: string | null; unitCost?: number;
  damagedQuantity?: number | null; linkedMovement?: string | null }[] };

export function mayReadPhysicalStock(auth: Session) {
  return has(auth.staff, 'stock.view') && has(auth.staff, 'business_locations.view');
}

export function physicalStockFilters(query: (name: string) => string | undefined, region: Region) {
  const market = query('market');
  const location = query('location');
  const after = query('after');
  const status = query('status');
  return { region, market: market && /^[A-Z]{2}$/.test(market) ? market : undefined,
    location: location && mongoId(location) ? location : undefined, q: query('q')?.trim().slice(0, 100) || undefined,
    status: status && ['low', 'available', 'unavailable'].includes(status) ? status : undefined,
    after: after && mongoId(after) ? after : undefined };
}

export async function physicalLocations(auth: Session, region: Region, market?: string) {
  if (!mayReadPhysicalStock(auth)) throw new ApiError(403);
  return api(url(`${recoveredStockPath}/locations`, { region, market }), auth.token) as Promise<{ locations: StockLocation[] }>;
}

export async function physicalStocks(auth: Session, filters: ReturnType<typeof physicalStockFilters>) {
  return api(url(`${recoveredStockPath}/stocks`, { ...filters, limit: '30' }), auth.token) as Promise<{ items: StockRow[]; next: string | null }>;
}

export async function physicalStockDetail(auth: Session, id: string, filters: ReturnType<typeof physicalStockFilters>, beforeMovement?: string) {
  if (!mongoId(id)) throw new ApiError(404);
  return api(url(`${recoveredStockPath}/stocks/${id}`, { region: filters.region, market: filters.market,
    location: filters.location, beforeMovement }), auth.token) as Promise<StockDetail>;
}
