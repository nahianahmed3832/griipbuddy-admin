import { api, integratedCheckoutEnabled, url, type Session } from './api';
import { has, superAdmin } from './sections';

export const transactionsPath = '/desk/payments/transactions';
export type TransactionRow = {
  id: string; state: string; origin: string; order?: string; orderNumber?: string | number; customer?: string;
  amount: number | null; currency?: string; date?: string; updated?: string; method?: string;
  reference?: string; gateway?: string; captured: number | null; refunded: number | null;
  mode?: string; reconciliation?: string;
};
export type TransactionResult = {
  rows: TransactionRow[]; total: number; page: number; size: number;
  summary: { state: string; currency?: string; count: number; amount: number | null }[];
};

export function canReadTransactions(auth: Session) {
  return integratedCheckoutEnabled() && superAdmin(auth.staff) && has(auth.staff, 'order.view');
}

export async function readTransactions(auth: Session, filters: Record<string, string | undefined>) {
  return await api(url('/transaction/workspace', filters), auth.token) as TransactionResult;
}
