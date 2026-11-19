export type LegacyDestination = { path: string; query?: Record<string, string>; pending?: string };
const entries: Record<string, LegacyDestination> = {};
const add = (name: string, path: string, query?: Record<string, string>, pending?: string) => {
  entries[name] = { path, query, pending };
};

add('overview', '/desk/overview');
add('reports', '/desk/reports');
add('reports/[reportId]', '/desk/reports/[reportId]');
add('orders', '/desk/orders/orders');
add('create-order', '/desk/orders/create');
add('order-details/[id]', '/desk/orders/orders/[id]');
add('marketplace-orders', '/desk/orders/marketplace');
add('marketplace-orders/cases', '/desk/orders/marketplace-cases');
add('marketplace-orders/cases/[id]', '/desk/orders/marketplace-cases/[id]');
add('orders/edit/[id]', '/desk/orders/orders/[id]', { draft: '1' }, 'Items and payment can be edited for eligible Bangladesh orders before assignment and dispatch.');
add('assigned-orders', '/desk/orders/assigned', undefined, 'Assignment history is available; verify older role-specific actions.');
add('fraud-checker', '/desk/orders/fraud-check', undefined, 'Requires a configured courier history provider.');
add('pre-orders', '/desk/orders/preorders');
add('pre-orders/create', '/desk/orders/preorders/create');
add('pre-orders/[id]', '/desk/orders/preorders/[id]');
add('pre-orders/[id]/edit', '/desk/orders/preorders/[id]', { edit: '1' });

add('products', '/desk/catalog/products');
add('create-product', '/desk/catalog/products/new');
add('update-product/[slug]', '/desk/catalog/products/[slug]', { mode: 'edit', lookup: 'slug' });
add('product-details/[id]', '/desk/catalog/products/[id]');
add('categories', '/desk/catalog/categories');
add('sub-categories', '/desk/catalog/subcategories');
add('add-new-category', '/desk/catalog/categories', { mode: 'create' });
add('add-new-sub-category', '/desk/catalog/subcategories', { mode: 'create-child' });
add('update-category/[slug]', '/desk/catalog/categories/[slug]', { mode: 'edit' });
add('update-sub-category/[slug]', '/desk/catalog/subcategories/[slug]', { mode: 'edit' });
add('category-attributes', '/desk/catalog/categories', { view: 'attributes', connectedOrganization: '1' });
add('catalog-menus', '/desk/catalog/categories', { view: 'menus', connectedOrganization: '1' });
add('catalog-collections', '/desk/catalog/categories', { view: 'collections', connectedOrganization: '1' });
add('catalog-devices', '/desk/catalog/approved-devices');
add('catalog-search', '/desk/catalog/search-maintenance');
add('all-brands', '/desk/catalog/brands');
add('create-brand', '/desk/catalog/brands/new');
add('update-brand/[id]', '/desk/catalog/brands/[id]');
add('product-reviews', '/desk/catalog/reviews');
add('product-reviews/[id]', '/desk/catalog/reviews/[id]');
add('product-faqs', '/desk/catalog/faqs');
add('product-faqs/add-new-faq', '/desk/catalog/faqs/new');
add('product-faqs/[slug]', '/desk/catalog/faqs/[slug]');
add('return-policies', '/desk/catalog/policies');
add('add-new-return-policy', '/desk/catalog/policies/new');
add('update-return-policy/[id]', '/desk/catalog/policies/[id]');
add('all-countries', '/desk/markets/countries');
add('create-country', '/desk/markets/countries/new');
add('update-country/[id]', '/desk/markets/countries/[id]');

add('check-outlet-stocks', '/desk/inventory/stock');
add('stock-adjustment/all', '/desk/inventory/adjustments');
add('stock-adjustment/create', '/desk/inventory/adjustments/create');
add('stock-transfer/all', '/desk/inventory/transfers');
add('stock-transfer/create', '/desk/inventory/transfers/create');
add('inventory/transfer-history', '/desk/inventory/transfers');
add('inventory/view/outlet', '/desk/inventory/warehouses', { inventoryView: 'outlet' });
add('inventory/view/warehouse', '/desk/inventory/warehouses', { inventoryView: 'warehouse' });
add('inventory/outlet-update', '/desk/inventory/outlet-update');
add('inventory/warehouse-update', '/desk/inventory/warehouse-update');
add('outlets-and-warehouse', '/desk/inventory/warehouses', { locationView: 'management' });
add('business-location/all', '/desk/inventory/warehouses');
add('business-location/create', '/desk/inventory/warehouses/create');
add('business-location/edit/[id]', '/desk/inventory/warehouses/[id]', { edit: '1' });
add('barcodes', '/desk/inventory/barcodes');
add('barcodes/generate', '/desk/inventory/generate-barcodes');
add('barcodes/receive', '/desk/inventory/scan-to-receive');
add('barcodes/logs', '/desk/inventory/barcode-logs');
add('barcodes/default-rate', '/desk/inventory/rates/new');
add('barcodes/default-rate/all', '/desk/inventory/rates');
add('purchase/all', '/desk/inventory/purchases');
add('purchase/edit/[id]', '/desk/inventory/purchases/[id]', { edit: '1' });
add('suppliers/all', '/desk/inventory/suppliers');
add('suppliers/create', '/desk/inventory/suppliers/new');
add('update-supplier/[id]', '/desk/inventory/suppliers/[id]', { edit: '1' });

add('customers', '/desk/customers/customers');
add('create-customer', '/desk/customers/create');
add('password-change-customer/[id]', '/desk/customers/customers/[id]', { action: 'password' });
add('coupons', '/desk/marketing/coupons');
add('create-coupon', '/desk/marketing/coupons/new');
add('coupons/[id]', '/desk/marketing/coupons/[id]');
add('expenses', '/desk/payments/expenses');
add('create-expense', '/desk/payments/expenses/new');
add('update-expense/[id]', '/desk/payments/expenses/[id]');
add('expense-report', '/desk/payments/expense-report');
add('expense-categories', '/desk/payments/expense-categories');
add('expense-subcategories', '/desk/payments/expense-subcategories');
add('sales-channels', '/desk/payments/channels');
add('payment-sources', '/desk/payments/sources');

add('header', '/desk/content/announcements');
add('hero-section', '/desk/content/hero', undefined, 'Media uploads require staging media storage to be configured.');
add('offer-page', '/desk/content/offer');
add('homepage/shop-by-category', '/desk/content/shop-by-category');
add('homepage/best-selling', '/desk/content/best-selling');
add('homepage/new-arrivals', '/desk/content/new-arrivals');
add('homepage/leather-section', '/desk/content/leather-section');
add('banner-update', '/desk/content/banners');
add('featured-products', '/desk/content/featured-products');

add('staffs', '/desk/staff/staff');
add('add-new-staff', '/desk/staff/staff/new');
add('update-staff/[slug]', '/desk/staff/staff/[slug]');
add('role', '/desk/staff/roles');
add('add-new-role', '/desk/staff/roles/new');
add('update-role/[slug]', '/desk/staff/roles/[slug]');
add('sales-executive', '/desk/orders/sales-executive');
add('pos/all', '/desk/pos/sales');
add('pos/create', '/desk/pos/editor');
add('pos/edit/[id]', '/desk/pos/editor/[id]');
add('pos/report', '/desk/pos/report');
add('current-plan', '/desk/settings/current-plan', undefined, 'Coming soon in the current admin.');
add('renew-subscription', '/desk/settings/renew-subscription', undefined, 'Coming soon in the current admin.');

export const legacyDestinations: Readonly<Record<string, LegacyDestination>> = Object.freeze(entries);
const patterns = Object.entries(legacyDestinations).map(([name, config]) => ({ parts: name.split('/'), config }));
const validPart = /^[A-Za-z0-9_-]{1,160}$/;
const localizedCategorySlug = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}-]{0,119}$/u;
export function resolveLegacy(parts: string[]) {
  if (!parts.length) return legacyDestinations.overview;
  const categoryEdit = parts.length === 2 && ['update-category', 'update-sub-category'].includes(parts[0]);
  if (parts.some((part, index) => !(categoryEdit && index === 1 ? localizedCategorySlug.test(part) || validPart.test(part) : validPart.test(part)))) {
    return undefined;
  }
  if (Object.hasOwn(legacyDestinations, parts.join('/'))) return legacyDestinations[parts.join('/')];
  for (const { parts: pattern, config } of patterns) {
    if (pattern.length === parts.length && pattern.every((part, index) => part === parts[index] || part.startsWith('['))) {
      let path = config.path;
      pattern.forEach((part,index) => { if (part.startsWith('[')) path = path.replace(part, parts[index]); });
      return { ...config, path };
    }
  }
}

export function legacyDirectory(config: LegacyDestination) {
  return config.path.includes('[') ? config.path.replace(/\/\[[a-zA-Z]+\].*$/, '') : config.path;
}
