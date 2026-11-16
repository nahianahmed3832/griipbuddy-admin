export type PurchaseEditLine = { variant: string; sku: string; title: string; quantity: string; cost: string; discount: string; tax: string };
export type PurchaseExtra = { type: string; amount: string; note: string };
export type PurchaseEditRecord = {
  id: string; revision: string; supplier: string; location: string; note: string; status: string; date: string;
  attachments: string; lines: PurchaseEditLine[]; expenses: PurchaseExtra[];
};
