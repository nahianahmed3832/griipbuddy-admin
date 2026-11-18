export const posRegisterPath = '/dashboard/pos/all';
export const posMethods = ['Cash', 'Advance', 'Card', 'Cheque', 'Bkash', 'Nagad', 'Rocket', 'Other'] as const;
export const posRanges = ['All Time', 'Today', 'Yesterday', 'Last 7 Days', 'Last 30 Days', 'This Month', 'Last Month',
  'This month last year', 'This Year', 'Last Year', 'Current financial year', 'Last financial year', 'Custom Range'] as const;
export type PosRange = typeof posRanges[number];

export const posTimeZone = 'Asia/Dhaka';

export function posDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: posTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function validPosDay(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function posRangeDates(range: PosRange, today: string, start?: string, end?: string): [string, string] {
  const current = new Date(today);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth();
  const day = current.getUTCDate();
  const financialYear = month < 3 ? year - 1 : year;
  const date = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  const monthRange = (y: number, m: number): [string, string] => [date(y, m, 1), date(y, m + 1, 0)];
  const yearRange = (y: number, first: number): [string, string] => [date(y, first, 1), date(y + 1, first, 0)];
  switch (range) {
    case 'All Time': return ['', ''];
    case 'Yesterday': return [date(year, month, day - 1), date(year, month, day - 1)];
    case 'Last 7 Days': return [date(year, month, day - 6), today];
    case 'Last 30 Days': return [date(year, month, day - 29), today];
    case 'This Month': return monthRange(year, month);
    case 'Last Month': return monthRange(year, month - 1);
    case 'This month last year': return monthRange(year - 1, month);
    case 'This Year': return yearRange(year, 0);
    case 'Last Year': return yearRange(year - 1, 0);
    case 'Current financial year': return yearRange(financialYear, 3);
    case 'Last financial year': return yearRange(financialYear - 1, 3);
    case 'Custom Range': return [validPosDay(start) ? start! : today, validPosDay(end) ? end! : today];
    default: return [today, today];
  }
}

export function dateLabel(day: string, short = false) {
  return new Intl.DateTimeFormat('en-US', { timeZone: posTimeZone, month: short ? 'short' : 'long', day: 'numeric', year: 'numeric' }).format(new Date(day));
}

export const posMoney = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);

export type PosReceipt = {
  serial: string; date: string; location: string; address: string; contact: string;
  customer: string; phone: string; method: string; subtotal: number; discount: number; total: number; paid: number;
  lines: { sku: string; attributes: string; quantity: number; price: number }[];
};

export type PosDiscount = { type: string; value: string };
export type PosItem = { sku: string; name: string; attributes?: string; regularPrice: number; salePrice: number; barcode?: string; available?: number };
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
export type PosRegisterRow = { id: string; serial: string; subtotal: number; cells: Partial<Record<PosColumn, string>>; amounts: Partial<Record<PosColumn, number>> };
