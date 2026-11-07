export type Column = {
  label: string;
  fields: string;
  kind?: 'badge' | 'date' | 'count' | 'money' | 'list';
};

export type Resource = {
  title: string;
  endpoint: string;
  permission: string;
  rows?: string;
  columns: Column[];
  search?: string;
  filter?: { key: string; label: string; options: string[] };
  region?: true;
  legacy?: string;
  legacyDetail?: string;
  legacyCreate?: string;
  flags?: 'market' | 'lots' | 'pos-finance';
  params?: Record<string, string>;
};

const col = (label: string, fields: string, kind?: Column['kind']): Column => ({ label, fields, kind });
const title = col('Name', 'name|title|name_en|full_name');
const state = col('Status', 'status|is_active|isActive|is_published|isPublished|enabled', 'badge');
const sku = col('SKU', 'sku|variant.sku|selected_variant.sku');
const date = col('Date', 'createdAt|created_at|date', 'date');
const region = col('Region', 'region', 'badge');
const location = col('Location', 'business_location.name|business_location.business_location_name|current_location.name|location.name|location.business_location_name');
const orderColumns = [col('Order', 'order_serial_id|serial_id|invoice_number'), col('Customer', 'customer_name|user.full_name'),
  state, col('Payment', 'payment_status|payment_info.status|payment_type', 'badge'), col('Tracking', 'tracking_code'), col('Order date', 'order_date|createdAt', 'date')];
const orderStatuses = ['PLACED', 'PROCESSING', 'AWAITING_STOCK', 'IN_REVIEW', 'IN_TRANSIT', 'DELIVERED', 'PENDING_RETURN', 'PARTIAL', 'RETURNED', 'CANCELLED'];
const orders: Resource = {
  title: 'Orders', endpoint: '/order', permission: 'order.view', columns: orderColumns, search: 'searchQuery',
  filter: { key: 'filter', label: 'Order status', options: orderStatuses }, region: true, legacy: 'orders',
  legacyCreate: 'create-order', legacyDetail: 'order-details/:id',
};
const catalogColumns = [title, sku, col('Category', 'category.name'), region, col('Variants', 'variants', 'count'), state];
const promo: Resource = {
  title: 'Coupons', endpoint: '/coupon/admin/all', permission: 'coupon.view', rows: 'coupons',
  columns: [col('Code', 'code|coupon_code'), col('Discount type', 'discountType|discount_type|type'), col('Usage limit', 'usageLimit|usage_limit|max_uses'),
    col('Ends', 'expireAt|end_date|expires_at', 'date'), state], legacy: 'coupons', legacyCreate: 'create-coupon', legacyDetail: 'coupons/:id',
};

export const resources: Record<string, Record<string, Resource>> = {
  orders: {
    orders,
    preorders: { title: 'Pre-orders', endpoint: '/pre-order', permission: 'pre_order.view', search: 'search',
      columns: [col('Pre-order', 'serial|serial_id|invoice_number'), col('Customer', 'customer_name'), state, col('Tracking', 'tracking_code'), date],
      legacy: 'pre-orders', legacyCreate: 'pre-orders/create', legacyDetail: 'pre-orders/:id' },
    assigned: { title: 'Assigned orders', endpoint: '/assigned-orders', permission: 'order.view', rows: 'assignedOrders',
      columns: [...orderColumns, location], legacy: 'assigned-orders' },
    returns: { ...orders, title: 'Returns', filter: { key: 'filter', label: 'Return status', options: ['PENDING_RETURN', 'PARTIAL', 'RETURNED'] },
      params: { filter: 'RETURNED' }, legacyCreate: undefined },
  },
  catalog: {
    products: { title: 'Products', endpoint: '/product/admin/all', permission: 'product.view', region: true, search: 'searchQuery',
      filter: { key: 'isPublished', label: 'Publication', options: ['true','false'] }, columns: catalogColumns,
      legacy: 'products', legacyCreate: 'create-product', legacyDetail: 'product-details/:id' },
    variants: { title: 'Variants', endpoint: '/product/admin/variants', permission: 'product.view', region: true, search: 'searchQuery',
      columns: [sku, col('Product', 'product.name|product_name'), col('Barcode', 'barcode'), col('Units available', 'total_available_quantity'), col('Currency prices', 'prices', 'list')],
      legacy: 'products' },
    categories: { title: 'Categories', endpoint: '/category', permission: 'product.view', columns: [title, col('Slug', 'slug'), state],
      legacy: 'categories', legacyCreate: 'add-new-category', legacyDetail: 'update-category/:slug' },
    subcategories: { title: 'Subcategories', endpoint: '/sub-category', permission: 'product.view', rows: 'subcategories',
      columns: [title, col('Parent', 'category.name'), col('Slug', 'slug'), state], legacy: 'sub-categories', legacyCreate: 'add-new-sub-category', legacyDetail: 'update-sub-category/:slug' },
    brands: { title: 'Brands', endpoint: '/brand/admin/all', permission: 'product.view', rows: 'brands', columns: [title, col('Slug', 'slug'), state],
      legacy: 'all-brands', legacyCreate: 'create-brand', legacyDetail: 'update-brand/:id' },
    reviews: { title: 'Reviews', endpoint: '/review', permission: 'review.view',
      columns: [col('Product', 'product.name'), col('Rating', 'rating'), col('Review', 'title|content|comment|review'), col('Status', 'status', 'badge'), date],
      legacy: 'product-reviews', legacyDetail: 'product-reviews/:id' },
    faqs: { title: 'FAQs', endpoint: '/faq/admin/all', permission: 'faq.view', rows: 'faqs',
      columns: [col('Question', 'question|title'), col('Product', 'product.name'), state, date], legacy: 'product-faqs', legacyCreate: 'product-faqs/add-new-faq' },
    policies: { title: 'Return policies', endpoint: '/return-policy', permission: 'product.view',
      columns: [title, col('Type', 'type'), state, date], legacy: 'return-policies', legacyCreate: 'add-new-return-policy', legacyDetail: 'update-return-policy/:id' },
  },
  inventory: {
    stock: { title: 'Stock', endpoint: '/stocks', permission: 'stock.view', region: true, search: 'searchQuery',
      columns: [col('Product', 'product.name'), sku, location, col('On hand', 'available_quantity'), col('Location reserved', 'qty_reserved'),
        col('Units received', 'total_received'), col('Units sold', 'total_sold')], legacy: 'check-outlet-stocks' },
    warehouses: { title: 'Locations', endpoint: '/business-location', permission: 'business_locations.view', rows: 'businessLocations', region: true,
      columns: [col('Location', 'business_location_name|name'), col('Type', 'business_location_type|type'), region, state], legacy: 'business-location/all',
      legacyCreate: 'business-location/create', legacyDetail: 'business-location/edit/:id' },
    purchases: { title: 'Purchases', endpoint: '/purchase', permission: 'purchase.view',
      columns: [col('Purchase', 'purchase_serial_id|purchase_id|invoice_number|reference'), col('Supplier', 'supplier.name|supplier.supplier_name'), location, state, date],
      legacy: 'purchase/all', legacyDetail: 'purchase/edit/:id' },
    suppliers: { title: 'Suppliers', endpoint: '/supplier', permission: 'supplier.view',
      columns: [col('Supplier', 'name|supplier_name'), col('Type', 'supplier_type|type'), state, date], legacy: 'suppliers/all',
      legacyCreate: 'suppliers/create', legacyDetail: 'update-supplier/:id' },
    rates: { title: 'Purchase rates', endpoint: '/purchase/default/all', permission: 'defaults.purchase',
      columns: [col('Supplier', 'supplier.name|supplier.supplier_name'), col('Product', 'product.name'), sku, date], legacy: 'barcodes/default-rate/all', legacyCreate: 'barcodes/default-rate' },
    barcodes: { title: 'Barcodes', endpoint: '/barcode', permission: 'barcode.view',
      filter: { key: 'status', label: 'Barcode status', options: ['IN_STOCK','ASSIGNED','SOLD','RETURNED'] },
      columns: [col('Barcode', 'barcode'), sku, location, state, col('Updates', 'updated_logs', 'count')], legacy: 'barcodes', legacyCreate: 'barcodes/generate' },
    adjustments: { title: 'Adjustments', endpoint: '/stocks/adjustment', permission: 'stock.view',
      columns: [col('Reason', 'reason|note|adjustment_type'), location, col('Quantity', 'quantity|total_quantity'), state, date],
      legacy: 'stock-adjustment/all', legacyCreate: 'stock-adjustment/create' },
    transfers: { title: 'Transfers', endpoint: '/stocks/admin/transfer-history', permission: 'stock.view', rows: 'stockTransferHistory',
      columns: [col('From', 'from_business_location.name|source_location.name|from_location.name'), col('To', 'to_business_location.name|destination_location.name|to_location.name'),
        col('Quantity', 'quantity|total_quantity'), state, date], legacy: 'stock-transfer/all', legacyCreate: 'stock-transfer/create' },
  },
  customers: {
    customers: { title: 'Customers', endpoint: '/user/admin/all/roles', permission: 'user.view', params: { role: 'USER' },
      columns: [col('Customer', 'full_name|name'), col('Orders', 'total_orders|orders', 'count'), col('Type', 'userType'), state, date],
      legacy: 'customers', legacyCreate: 'create-customer' },
    repeat: { title: 'Repeat customers', endpoint: '/repeat-customer', permission: 'user.view', rows: 'customers',
      columns: [col('Customer', 'customer_name|full_name|name'), col('Orders', 'total_orders|order_count', 'count'), state, date], legacy: 'customers' },
  },
  markets: {
    countries: { title: 'Countries', endpoint: '/country/admin/all', permission: 'product.view', rows: 'countries', flags: 'market',
      columns: [title, col('Code', 'code'), col('Currency', 'currency'), region, state], legacy: 'all-countries', legacyDetail: 'update-country/:id', legacyCreate: 'create-country' },
    pricing: { title: 'Regional prices', endpoint: '/product/admin/variants', permission: 'product.view', region: true, search: 'searchQuery',
      columns: [sku, col('Product', 'product.name|product_name'), col('Regular BDT', 'regular_price'), col('Sale BDT', 'sale_price'), col('Currency prices', 'prices', 'list')],
      legacy: 'products' },
    visibility: { title: 'Product visibility', endpoint: '/product/admin/all', permission: 'product.view', region: true, search: 'searchQuery',
      columns: [title, sku, region, col('Markets', 'available_countries', 'list'), state], legacy: 'products', legacyDetail: 'product-details/:id' },
    currencies: { title: 'Currencies', endpoint: '/country/currencies', permission: 'product.view', rows: 'currencies',
      columns: [col('Currency', 'code'), col('Label', 'label'), col('Symbol', 'symbol'), col('Default', 'is_default', 'badge')] },
  },
  shipping: {
    tracking: { ...orders, title: 'Tracking', filter: { key: 'filter', label: 'Shipment status', options: ['IN_REVIEW','HANDED_OVER_TO_COURIER','IN_TRANSIT','DELIVERED','CANCELLED','RETURNED'] }, legacyCreate: undefined },
  },
  payments: {
    sources: { title: 'Accounting sources', endpoint: '/payment-source', permission: 'expense.view', columns: [title, col('Type', 'type'), state, date], legacy: 'payment-sources' },
    expenses: { title: 'Expenses', endpoint: '/expense', permission: 'expense.view',
      columns: [title, col('Amount', 'amount', 'money'), col('Category', 'category.name|expense_category.name'), col('Approval', 'approval_status', 'badge'), state, date],
      legacy: 'expenses', legacyCreate: 'create-expense', legacyDetail: 'update-expense/:id' },
    'expense-categories': { title: 'Expense categories', endpoint: '/expense-category', permission: 'expense.view', columns: [title, state, date], legacy: 'expense-categories' },
    'expense-subcategories': { title: 'Expense subcategories', endpoint: '/expense-subcategory', permission: 'expense.view',
      columns: [title, col('Category', 'category.name'), state, date], legacy: 'expense-subcategories' },
    channels: { title: 'Sales channels', endpoint: '/sales-channel', permission: 'expense.view', columns: [title, state, date], legacy: 'sales-channels' },
    transactions: { ...orders, title: 'Order payments', legacyCreate: undefined },
  },
  marketing: { coupons: promo },
  content: {
    announcements: { title: 'Announcements', endpoint: '/cms/admin/top-bar-messages', permission: 'cms.view',
      columns: [col('Message', 'message|text|title'), region, state, date], legacy: 'header' },
    banners: { title: 'Banners', endpoint: '/cms/banners', permission: 'cms.view', rows: 'banners',
      columns: [title, col('Placement', 'position|type'), state, date], legacy: 'banner-update' },
    hero: { title: 'Hero', endpoint: '/cms/hero-section', permission: 'cms.view',
      columns: [title, col('Placement', 'position|order'), state, date], legacy: 'hero-section' },
  },
  pos: {
    sales: { title: 'Point of sale', endpoint: '/pos/sale', permission: 'pos.view', rows: 'posSales', search: 'q', region: true,
      columns: [col('Sale', 'sale_serial_id|invoice_number'), location, col('Amount', 'total_amount|grand_total', 'money'), state, date],
      legacy: 'pos/all', legacyCreate: 'pos/create', legacyDetail: 'pos/edit/:id' },
    report: { title: 'POS report', endpoint: '/pos/admin/report', permission: 'pos.view', rows: 'products', flags: 'pos-finance',
      columns: [col('Product', 'product.name|product_name|name'), sku, col('Units', 'total_quantity|quantity'), col('Sales', 'total_sales|sales', 'money')], legacy: 'pos/report' },
  },
  staff: {
    staff: { title: 'Staff', endpoint: '/user/admin/all/roles', permission: 'user.view',
      columns: [col('Staff member', 'full_name'), col('Role', 'role'), location, state, date],
      legacy: 'staffs', legacyCreate: 'add-new-staff', legacyDetail: 'update-staff/:id' },
    roles: { title: 'Roles and permissions', endpoint: '/roles', permission: 'role.view', rows: 'roles',
      columns: [col('Role', 'role_name'), col('Permissions', 'permissions', 'count'), col('Grants', 'permissions', 'list')],
      legacy: 'role', legacyCreate: 'add-new-role', legacyDetail: 'update-role/:id' },
  },
};

export const sections = [
  { id: 'overview', label: 'Overview', group: 'Workspace', icon: 'layout', description: 'Track sales, fulfilment and inventory across your store.' },
  { id: 'orders', label: 'Orders', group: 'Commerce', icon: 'orders', description: 'Manage the order pipeline, pre-orders, assignments and returns.' },
  { id: 'catalog', label: 'Catalog', group: 'Commerce', icon: 'catalog', description: 'Manage products, variants, taxonomy and product information.' },
  { id: 'inventory', label: 'Inventory', group: 'Commerce', icon: 'inventory', description: 'See stock positions, warehouse activity and purchasing.' },
  { id: 'customers', label: 'Customers', group: 'Commerce', icon: 'customers', description: 'Find accounts and review customer activity.' },
  { id: 'pos', label: 'Point of sale', group: 'Commerce', icon: 'pos', description: 'Review outlet sales and point of sale reports.' },
  { id: 'markets', label: 'Markets', group: 'Operations', icon: 'markets', description: 'Manage countries, currencies, product coverage and pricing.' },
  { id: 'shipping', label: 'Shipping', group: 'Operations', icon: 'shipping', description: 'Track fulfilment and access the Steadfast workflows.' },
  { id: 'payments', label: 'Payments', group: 'Operations', icon: 'payments', description: 'Manage checkout methods, payment review and accounting sources.' },
  { id: 'reports', label: 'Reports', group: 'Operations', icon: 'reports', description: 'Open operational reports and download permission-scoped exports.' },
  { id: 'marketing', label: 'Marketing', group: 'Storefront', icon: 'marketing', description: 'Manage discounts, promotions and campaign workflows.' },
  { id: 'content', label: 'Storefront content', group: 'Storefront', icon: 'content', description: 'Manage announcements, banners and homepage merchandising.' },
  { id: 'staff', label: 'Staff & access', group: 'Administration', icon: 'staff', description: 'Review team accounts, roles and permissions.' },
  { id: 'settings', label: 'Settings', group: 'Administration', icon: 'settings', description: 'Review workspace integrations and operational controls.' },
  { id: 'workflows', label: 'Workflow library', group: 'Administration', icon: 'library', description: 'Find preserved admin workflows, including screens outside the original sidebar.' },
] as const;

export type Section = (typeof sections)[number];
export type Region = 'BD' | 'INTERNATIONAL';
export type Staff = { id: string; name: string; role: string; permissions: string[] };
export function has(staff: Staff, permission: string) { return staff.permissions.includes(permission); }
export function superAdmin(staff: Staff) { return staff.role.toUpperCase().replace(/ /g, '_') === 'SUPER_ADMIN' && has(staff, 'manage-permissions'); }
export function visibleSections(staff: Staff) {
  return sections.filter(({ id }) => {
    if (['overview', 'settings', 'workflows'].includes(id)) return true;
    if (id === 'reports') return staff.permissions.some(key => key.startsWith('report.'));
    if (id === 'payments' && superAdmin(staff)) return true;
    return Object.values(resources[id] ?? {}).some(item => has(staff, item.permission));
  });
}
