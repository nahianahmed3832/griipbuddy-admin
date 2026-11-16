import type { Region, Staff } from './sections';
import { has } from './sections';

export const stockChangeModes = ['transfer', 'adjustment', 'outlet-update', 'warehouse-update'] as const;
export type StockChangeMode = typeof stockChangeModes[number];
export type StockChangeLocation = { id: string; name: string; type: string };
export type StockChangeProduct = { product: string; variant: string; sku: string; name: string; available: number };
export type StockExpense = { type: string; amount: number; note?: string };
export const stockChangeApi = '/stocks/workspace/changes';
export const isStockTransfer = (mode: StockChangeMode) => mode === 'transfer' || mode === 'outlet-update';
export const stockChangeSource = (mode: StockChangeMode) => mode === 'outlet-update' || mode === 'warehouse-update' ? 'WAREHOUSE' : undefined;
export const stockChangeTitle: Record<StockChangeMode, string> = {
  transfer: 'Add Stock Transfer',
  adjustment: 'Add Stock Adjustment',
  'outlet-update': 'Outlet Inventory Update',
  'warehouse-update': 'Warehouse Inventory Update',
};

export function canAccessStockChanges(staff: Staff, mode: StockChangeMode) {
  return ['stock.view', 'stock.create', 'product.view', 'business_locations.view', ...(isStockTransfer(mode) ? ['stock.transfer'] : [])]
    .every(grant => has(staff, grant));
}

export function stockChangeHistory(mode: StockChangeMode, region: Region) {
  const section = isStockTransfer(mode) ? 'transfers' : 'adjustments';
  return '/desk/inventory/' + section + (region === 'BD' ? '' : '?region=' + region);
}
