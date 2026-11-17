export const posRegisterPath = '/dashboard/pos/all';
export const posMethods = ['Cash', 'Advance', 'Card', 'Cheque', 'Bkash', 'Nagad', 'Rocket', 'Other'] as const;
export const posTimeZone = 'Asia/Dhaka';

export function posDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: posTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function validPosDay(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function dateLabel(day: string, short = false) {
  return new Intl.DateTimeFormat('en-US', { timeZone: posTimeZone, month: short ? 'short' : 'long', day: 'numeric', year: 'numeric' }).format(new Date(day));
}

export const posMoney = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);

export type PosDiscount = { type: string; value: string };
export type PosItem = { sku: string; name: string; regularPrice: number; salePrice: number; barcode?: string; available?: number };
export type PosLine = PosItem & { quantity: string; discount: PosDiscount };

export function posLineTotal(line: PosLine) {
  const base = Math.round(line.regularPrice * 100) * (Number(line.quantity) || 0);
  return base - posDiscountMinor(base, line.discount);
}

export function posDiscountMinor(base: number, discount: PosDiscount) {
  const value = Math.round(Number(discount.value || 0) * 100);
  return discount.type === 'PERCENTAGE' ? Math.round(base * value / 10000) : value;
}

export const posColumns = [
  ['date', 'Date'], ['invoice', 'Sale, Invoice No.'], ['customer', 'Customer'], ['location', 'Location'],
  ['quantity', 'Total Items'], ['sku', 'Items SKU'], ['paid', 'Total Paid'], ['cost', 'Total Purchase Price'],
  ['profit', 'Total Profit'], ['discount', 'Total Discount'], ['total', 'Total Amount'], ['status', 'Payment Status'],
  ['method', 'Payment Method'], ['creator', 'Added By'], ['due', 'Amount Due'], ['note', 'Sale Note'], ['paymentNote', 'Payment Note'],
] as const;
export type PosColumn = typeof posColumns[number][0];
export type PosRegisterRow = { id: string; serial: string; cells: Partial<Record<PosColumn, string>>; amounts: Partial<Record<PosColumn, number>> };
