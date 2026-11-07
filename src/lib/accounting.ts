import type { Region, Staff } from './sections';
import { has, superAdmin } from './sections';

export const financePath = '/desk/payments/accounting';
export const financeRead = (staff: Staff) => has(staff, 'expense.view') &&
  has(staff, 'purchase.price.view') && has(staff, 'potential.profit.view');
export const financeHQ = (staff: Staff) => financeRead(staff) && superAdmin(staff) && has(staff, 'international.access');
export const financeWrite = () => {
  const target = process.env.GRIIP_ADMIN_TARGET;
  const origin = process.env.GRIIP_ADMIN_PUBLIC_ORIGIN;
  return (target === 'fixture' && process.env.GRIIP_ADMIN_FIXTURE_WRITES === '1') ||
    (target === 'integration' && origin === 'https://dev.griipbuddy.com') ||
    ((target === 'staging' || !target) && process.env.GRIIP_ADMIN_STAGE_WRITES === '1' &&
      (!origin || origin === 'https://dev.griipbuddy.com'));
};

export type Account = { code: string; name: string; group: string };
export type Book = { _id: string; name: string; country: string; start: string; closedThrough?: string };
export type Settings = { accounts: Account[]; books: Book[] };
export type SourceKind = 'expense' | 'order' | 'pos' | 'refund';
export type Source = {
  id: string; kind: SourceKind; date: string; currency: string; title: string; reference?: string;
  market?: string; amount: number | null; tax?: number; shipping?: number; cost?: number | null; category?: string;
  method?: string; issue?: string; status?: 'draft' | 'posted' | 'rejected'; changed: boolean;
};
export type Line = { account: string; debit: number; credit: number; usdDebit: number; usdCredit: number };
export type Journal = {
  _id: string; book: string; region: Region; market: string; date: string; memo: string; reference?: string;
  status: 'draft' | 'posted' | 'rejected'; currency: string; rate: string; rateSource?: string; lines: Line[];
  source?: { kind: SourceKind; id: string }; reverses?: string; reversed: boolean; rejection?: string;
};
export type Balance = Account & { debit: number; credit: number; balance: number };
export const statementLines = [
  ['revenue', 'Net revenue'], ['cogs', 'Cost of goods sold'], ['grossProfit', 'Gross profit'],
  ['expense', 'Operating expenses'], ['operatingIncome', 'Operating income'], ['otherIncome', 'Other income'],
  ['otherExpense', 'Other expense'], ['tax', 'Income tax expense'], ['netIncome', 'Net profit / loss'],
] as const;
export type Statement = Record<typeof statementLines[number][0], number> & {
  trialBalance: Balance[];
  balanceSheet: { assets: number; liabilities: number; equity: number; retainedEarnings: number; totalEquity: number };
};
export type FinanceReport = Statement & {
  counts: { draft?: number; posted?: number; rejected?: number };
  native: (Statement & { currency: string })[];
  dimensions: (Statement & { book: string; region: Region; market: string })[];
};
export const sourceNames = { expense: 'Legacy expenses', order: 'Delivered website orders', pos: 'Point of sale', refund: 'Completed refunds' };
export const currencyCodes = Intl.supportedValuesOf('currency');

export function money(minor: number, currency = 'USD') {
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' });
  return formatter.format(minor / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2));
}
