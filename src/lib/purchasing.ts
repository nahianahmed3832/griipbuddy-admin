export const purchasesPath = '/desk/operations/purchases';

export type PurchaseAccess = { buy: boolean; receive: boolean; finance: boolean };
export type PurchaseChoice = { _id: string; name?: string; business_location_name?: string };
export type SupplierChoice = PurchaseChoice & {
  contact_id: number; address?: string; phone?: string; email?: string; default_payment_terms?: string;
};
export type VariantChoice = {
  variant: string; product: string; sku: string; name: string; supplierSku?: string; sourceVariant?: string;
  quoteUnitMinor?: number | null; quoteCurrency?: string; quoteReference?: string;
};
export type PurchaseChoices = { warehouses: PurchaseChoice[]; suppliers: SupplierChoice[]; item?: VariantChoice };
export type ReviewedProposal = { id: string; attempt: string; supplier: string; variant: string; quantity: number };
export type PurchaseLine = VariantChoice & {
  quantity: number; purchasingUnit: string; unitsPerPurchase: number; conversionReference?: string;
  unitMinor: number | null; stockUnits: number; amountMinor: number | null;
};
export type Evidence = { type: 'manual' | 'document'; reference: string; at: string; note?: string };
export type Quote = {
  hash: string; supplier: string; warehouse: string; supplierName: string; supplierReference: string; warehouseName: string;
  warehouseAddress?: string;
  currency: string; lines: PurchaseLine[]; subtotalMinor: number | null; freightMinor: number | null; taxMinor: number | null;
  otherMinor: number | null; otherReference?: string; totalMinor: number | null; knownMinor: number; deliveryTerms?: string;
  paymentTerms?: string; quoteReference?: string; expiresAt?: string; requestedAt?: string;
  fx?: { rate: string; evidence: Evidence };
};
export type PurchaseBalance = {
  variant: string; ordered: number; physical: number; delivered: number; accepted: number;
  held: number; rejected: number; expected: number; closed: number;
};
export type ReceiptLine = {
  _id: string; receipt: string; variant?: string; item?: string; sku?: string; name?: string; seen: number; held: number;
  rejected: number; posted: number; toOrder: number; exceptions: string[]; referenceResolved: boolean;
};
export type PurchaseAudit = { id: string; at: string; actor?: string; kind: string; payload?: {
  evidence?: Evidence; receivedAt?: string; reference?: string; reason?: string; evidenceReference?: string; status?: string;
  closure?: { reason: string; evidence?: Evidence; reference?: string };
  quantity?: number; issue?: string; lines?: { id: string; sku?: string; item?: string; physical: number; accepted: number; held: number; rejected: number }[];
  stock?: { movement: string; quantity: number }[] | { movement: string; quantity: number };
  movement?: string; original?: string;
} };
export type PurchaseFinance = {
  currencies: { currency: string; invoiced: number | null; recorded: number; verified: number; unmatched: number; unmatchedInvoice: number | null }[];
  records: { id: string; at: string; kind: string; amountMinor?: number; currency?: string; evidence: Evidence;
    staffVerified: boolean; invoiceReference?: string; payment?: string }[];
};
export type Purchase = {
  id: string; reference: string; test: boolean; revision: number; requester: string; proposal?: string; warehouse: string;
  supplier: string; state: string; canReceive: boolean; expectedAt?: string; approvedAt?: string; closed: boolean;
  quote?: Quote; editor?: Quote; blockers: string[];
  lines: (VariantChoice & { stockUnits: number })[]; totals: PurchaseBalance[]; receiptLines: ReceiptLine[];
  postings: { _id: string; line: string; quantity: number; corrected: number; movement: string; lot: string }[];
  audit: PurchaseAudit[]; finance?: PurchaseFinance; overflow: boolean;
};
export type PurchaseList = { orders: {
  id: string; reference: string; supplier: string; warehouse: string; expected: number; expectedAt?: string;
  state: string; expired: boolean; test: boolean;
}[]; overflow: boolean };
