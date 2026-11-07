export const barcodePattern = /^[a-z\d-]{1,60}$/i;
export const receiptLimit = 50;
export const barcodeStatuses = ['QC_PENDING', 'IN_STOCK', 'ASSIGNED', 'ALLOCATED', 'PICKED', 'SHIPPED', 'SOLD', 'PENDING_RETURN',
  'RETURNED', 'DAMAGED', 'QUARANTINE', 'MISSING', 'EXPIRED', 'REFURBISHING', 'DISCARDED'];
export const barcodeConditions = ['NEW', 'USED', 'REFURBISHED', 'OPEN_BOX', 'PACKAGING_DAMAGED', 'DEFECTIVE', 'PHYSICALLY_DAMAGED', 'SCRAP'];

export type BarcodeLabel = { barcode: string; sku: string };
export type BarcodeRow = BarcodeLabel & { product: string; status: string; condition: string; createdAt: string };
export type BarcodeVariant = { sku: string; name: string; options: string };
