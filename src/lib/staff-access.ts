export const directory = '/desk/staff/staff';
export const roleDirectory = '/desk/staff/roles';
export const activityPath = '/desk/staff/activity';
export const endpoint = '/staff-access';

export type Option = { id: string; name: string };
export type Options = { roles: (Option & { permissions: string[] })[]; locations: (Option & { region: string })[] };
export type StaffRecord = Option & {
  email?: string; phone: string; role: string; roleId: string; status: string; locationId: string;
  location?: string; revision: string | null; setupExpiresAt?: string; setupRevoked: boolean; protected: boolean; permissions: string[];
};
export type RoleRecord = Option & {
  count: number; assigned: number; protected: boolean; builtIn: boolean; revision: string | null; permissions: string[];
};
export type StaffEvent = { _id: string; actor: string; target: string; actorName?: string; targetName?: string;
  at: string; action: string; changes?: { added?: string[]; removed?: string[]; role?: string | { from: string; to: string } } };
export type Paged<T> = { rows: T[]; total: number; page: number; size: number };
export type SetupLink = { token: string; expiresAt: string };

const names: Record<string, string> = {
  order: 'Orders', pre_order: 'Preorders', product: 'Products', user: 'Users', stock: 'Stock',
  cms: 'Storefront content', purchase: 'Purchases', report: 'Reports', courier: 'Courier',
  supplier: 'Suppliers', business_locations: 'Business locations', pos: 'Point of sale',
  overview: 'Overview', role: 'Roles', coupon: 'Coupons', faq: 'FAQs', review: 'Reviews',
  expense: 'Expenses', barcode: 'Barcodes', international: 'Operating regions',
  potential: 'Financial data', 'manage-permissions': 'Access administration', defaults: 'Purchases',
};
const actionNames: Record<string, string> = {
  'manage-permissions': 'Manage access permissions', 'international.access': 'Switch to international operations',
  'defaults.purchase': 'Create purchases from defaults', 'purchase.price.view': 'View purchase costs',
  'potential.profit.view': 'View estimated profit', 'expense.approval': 'Approve expenses',
  'barcode.assign.stock': 'Assign barcodes to stock', 'report.view': 'View reports overview',
};
const words = (value: string) => value.replaceAll('_', ' ').replace(/\bpos\b/gi, 'POS');
export function permissionInfo(key: string) {
  const [domain, ...tail] = key.split('.');
  const action = tail.pop() ?? '';
  const group = key === 'purchase.price.view' ? 'Financial data' : names[domain] || 'Other';
  const verb = ({ view: 'View', create: 'Create', update: 'Edit', delete: 'Delete', transfer: 'Transfer', generate: 'Generate', reset: 'Reset', return: 'Return' } as Record<string, string>)[action] ?? words(action);
  const label = actionNames[key] || [verb, tail.length ? words(tail.join(' ')) + (domain === 'report' ? ' report' : '') : group.toLowerCase()].join(' ');
  const sensitive = ['role', 'user', 'potential', 'international', 'manage-permissions'].includes(domain) ||
    ['delete', 'approval', 'return', 'reset', 'transfer'].includes(action) ||
    ['purchase.price.view', 'report.stock_valuation.view'].includes(key);
  return { key, label, group, sensitive };
}

export const templates = [
  { name: 'Warehouse viewer', detail: 'See stock, barcodes and locations.', grants: ['stock.view', 'barcode.view', 'business_locations.view'] },
  { name: 'Order support', detail: 'Look up orders, preorders and products.', grants: ['order.view', 'pre_order.view', 'product.view'] },
  { name: 'Content editor', detail: 'Create and edit storefront content and FAQs.', grants: ['cms.view', 'cms.create', 'cms.update', 'faq.view', 'faq.create', 'faq.update'] },
];
export const statusLabel: Record<string, string> = { ACTIVE: 'Active', PENDING: 'Pending setup', INACTIVE: 'Suspended', BLOCKED: 'Blocked', BANNED: 'Banned' };
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Dhaka' }).format(new Date(date)) + ' BD time';
}
