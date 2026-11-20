export const suppliersPath = '/desk/inventory/suppliers';
export const supplierTypes = ['BUSINESS', 'COMPANY', 'INDIVIDUAL'] as const;
export type SupplierRecord = {
  id: string; name: string; type: string; contact_id: string;
  phone: string; email: string; address: string; default_payment_terms: string; tax_info: string; notes: string;
};

export const supplierFields = [
  { name: 'name', label: 'Supplier name', max: 120 },
  { name: 'contact_id', label: 'Contact reference number', max: 8 },
  { name: 'phone', label: 'Phone number', max: 40 },
  { name: 'email', label: 'Email', max: 254 },
  { name: 'address', label: 'Address', max: 500 },
  { name: 'default_payment_terms', label: 'Payment terms', max: 200 },
  { name: 'tax_info', label: 'Tax information', max: 200 },
  { name: 'notes', label: 'Notes', max: 1000 },
] as const;
