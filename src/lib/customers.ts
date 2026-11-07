export const customersPath = '/desk/customers/customers';
export const customerFilters = ['q', 'status', 'type', 'verification', 'sort'] as const;
export const customerStatuses = ['ACTIVE', 'INACTIVE', 'PENDING', 'BLOCKED', 'BANNED'] as const;
export const customerTypes = [['REGISTERED', 'Registered'], ['POS', 'Point of sale'], ['OTHERS', 'Other']] as const;

export type Customer = {
  _id: string; full_name?: string; phone_number?: string; email?: string;
  status?: string; userType?: string; is_verified_number?: boolean;
  createdAt?: string; updatedAt?: string; workspace_tags?: string[]; orderCount?: number;
};
export type CustomerActivity = {
  _id: string; actorName?: string; kind: 'created' | 'edited' | 'note' | 'status'; detail: string; createdAt: string;
};
export type CustomerOrder = {
  _id: string; order_serial_id?: number; invoice_number?: string; order_date?: string;
  createdAt?: string; status?: string; currency?: string; total_amount?: number;
};

export function customerStatus(value?: string) {
  if (value === 'INACTIVE') return 'Deactivated';
  return value || 'Unknown';
}

export function customerDate(value?: string, time = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium', ...(time && { timeStyle: 'short' }), timeZone: 'Asia/Dhaka',
  }).format(new Date(value));
}
