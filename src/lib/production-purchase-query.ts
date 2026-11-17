export const productionPurchasePath = '/dashboard/purchase/all';
export const productionRatesPath = '/dashboard/barcodes/default-rate/all';
export const productionRateFormPath = '/dashboard/barcodes/default-rate';

export function purchaseQueryPath(path: string, params: Record<string, string | undefined>) {
  const url = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && !(key === 'region' && value === 'BD') && !(key === 'limit' && value === '20')) url.set(key, value);
  }
  return path + (url.size ? '?' + url : '');
}
