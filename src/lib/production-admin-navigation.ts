import 'server-only';

import { canWrite, type Session } from './api';
import { permitted } from './data';
import { resolveLegacy } from './legacy-destinations';
import { canOperate } from './operations';
import { has, resources, superAdmin, type Region, type Section } from './sections';
import { smartInventoryTabs } from './smart-inventory';
import { canOpenCounter } from './counter-pos';

type Entry = { label: string; path: string; permission?: string; connected?: boolean; central?: boolean; pilot?: boolean; homepage?: 'connected' | 'legacy' };
const item = (label: string, path: string, permission?: string, connected?: boolean, central?: boolean): Entry =>
  ({ label, path: '/dashboard/' + path, permission, connected, central });
const pilotItem = (label: string, path: string, permission: string): Entry =>
  ({ ...item(label, path, permission, true), pilot: true });
const homepageItem = (label: string, path: string, homepage: NonNullable<Entry['homepage']>, permission?: string): Entry =>
  ({ ...item(label, path, permission), homepage });
const navigation = [
  { title: 'Overview', groups: [
    { label: 'Dashboard', icon: 'layout', entries: [item('Overview', 'overview'), item('Fraud Checker', 'fraud-checker', 'order.view')] },
    { label: 'Reports', icon: 'reports', entries: [
      item('All Reports', 'reports'), item('Sales Summary', 'reports/sales-summary', 'report.sales_summary.view'),
      item('Orders Needing Action', 'reports/pending-fulfilment', 'report.pending_fulfilment.view'),
      item('Stock Valuation', 'reports/stock-valuation', 'report.stock_valuation.view'),
      item('Low Stock & Reorder', 'reports/low-stock', 'report.low_stock.view'),
    ] },
  ] },
  { title: 'Sales & Orders', groups: [
    { label: 'Website Orders', icon: 'orders', entries: [item('All Orders', 'orders'),
      item('Marketplace Orders', 'marketplace-orders', 'order.view', true), item('Create Order', 'create-order')] },
    { label: 'Point of sale', icon: 'pos', entries: [item('New counter sale', 'pos/create', 'pos.create'),
      item('Counter sale history', 'pos/counter-sales', 'pos.view'), item('Counter configuration', 'pos/counter-configuration', 'pos.update', undefined, true)] },
    { label: 'Pre-Orders', icon: 'pos', entries: [item('All Pre-Orders', 'pre-orders'), item('Create Pre-Order', 'pre-orders/create')] },
  ] },
  { title: 'Inventory', groups: [
    { label: 'Products', icon: 'catalog', entries: [
      item('All Products', 'products'), item('Create Product', 'create-product'), item('Stocks Report', 'check-outlet-stocks'),
      pilotItem('Connected Products', 'products', 'product.view'), pilotItem('Connected Stock', 'check-outlet-stocks', 'stock.view'),
      item('Catalog Exchange', 'catalog-exchange', 'product.view', true, true), item('Seller Listing Review', 'seller-listing-reviews', 'product.view', true), item('Product Reviews', 'product-reviews'), item('Product Faqs', 'product-faqs'), item('Return Policies', 'return-policies'),
      item('All Brands', 'all-brands'), item('Countries & Currency', 'all-countries'),
      item('Approved Device Models', 'catalog-devices', 'product.view', true, true),
    ] },
    { label: 'Purchases', icon: 'inventory', entries: [
      item('All Purchase', 'purchase/all'), item('Default Purchase Rate', 'barcodes/default-rate'), item('Default Purchase List', 'barcodes/default-rate/all'),
    ] },
    { label: 'Smart Inventory', icon: 'inventory', entries: [
      item('Physical Stock', 'inventory/physical-stock', 'stock.view'), item('All Barcodes', 'barcodes'), item('Generate Barcodes', 'barcodes/generate'), item('Scan to Receive', 'barcodes/receive'),
      item('Barcode Logs', 'barcodes/logs'),
    ] },
    { label: 'Categories & Subcategories', icon: 'marketing', entries: [
      item('All Categories', 'categories'), item('All Subcategories', 'sub-categories'),
      pilotItem('Connected Categories', 'categories', 'product.view'),
      item('Create Category', 'add-new-category'), item('Create Subcategory', 'add-new-sub-category'),
      item('Category Attributes', 'category-attributes', 'product.view', true),
    ] },
    { label: 'Business Locations', icon: 'markets', entries: [
      item('All Business Locations', 'business-location/all'), item('Add Business Location', 'business-location/create'),
    ] },
  ] },
  { title: 'Partners & Customers', groups: [
    { label: 'Supplier', icon: 'shipping', entries: [item('All Suppliers', 'suppliers/all'), item('Add Suppliers', 'suppliers/create')] },
    { label: 'Customers', icon: 'customers', entries: [item('All Customers', 'customers'), item('Create Customer', 'create-customer')] },
  ] },
  { title: 'Marketing', groups: [
    { label: 'Coupon', icon: 'marketing', entries: [item('Create Coupon', 'create-coupon'), item('All Coupons', 'coupons')] },
  ] },
  { title: 'Finance', groups: [
    { label: 'Expense & Accounting', icon: 'payments', entries: [
      item('All Expenses', 'expenses'), item('Add Expense', 'create-expense'), item('Expense Report', 'expense-report'),
      item('Expense Categories', 'expense-categories'), item('Expense Subcategories', 'expense-subcategories'),
      item('Sales Channels', 'sales-channels'), item('Payment Sources', 'payment-sources'),
    ] },
  ] },
  { title: 'Content', groups: [
    { label: 'Content Management', icon: 'content', entries: [
      item('Header', 'header'), item('Hero Section', 'hero-section'), item('Global Offer', 'offer-page'),
      homepageItem('Homepage', 'homepage', 'connected', 'cms.view'),
      homepageItem('Shop by Category', 'homepage/shop-by-category', 'legacy'),
      homepageItem('Best Selling', 'homepage/best-selling', 'legacy'),
      homepageItem('New Arrivals', 'homepage/new-arrivals', 'legacy'),
      homepageItem('Leather Section', 'homepage/leather-section', 'legacy'),
      item('Storefront Menus', 'catalog-menus', 'product.view', true), item('Collections', 'catalog-collections', 'product.view', true),
      item('Search Maintenance', 'catalog-search', 'product.view', true, true),
    ] },
  ] },
  { title: 'Administration', groups: [
    { label: 'Manage Staffs and Roles', icon: 'staff', entries: [
      item('Manage Staffs', 'staffs', 'user.view'), item('Manage Roles', 'role', 'role.view'),
      item('Access activity', 'staff-activity', 'manage-permissions', undefined, true),
      item('Seller Hub', 'seller-hub', 'user.view', true, true), item('Seller verification', 'seller-verification', 'user.view', true, true),
    ] },
  ] },
];

export type ProductionNavigation = typeof navigation;

export function productionNavigation({ auth, visible, region, fraud, connectedCatalog, connectedHomepage, catalogPilot,
  createOrder, createCustomer, canUseConnectedMarket }: {
  auth: Session; visible: readonly Section['id'][]; region: Region; fraud: boolean; connectedCatalog: boolean;
  connectedHomepage: boolean; catalogPilot: boolean; createOrder: boolean; createCustomer: boolean;
  canUseConnectedMarket: (homepage: boolean) => boolean;
}): ProductionNavigation {
  const { staff } = auth;
  const writes = canWrite(staff);
  const canCreate = (permission: string) => writes && has(staff, permission);
  const special: Record<string, boolean> = {
    'catalog-exchange': !catalogPilot,
    'seller-listing-reviews': has(staff, 'product.update'),
    'inventory/physical-stock': has(staff, 'business_locations.view'),
    reports: staff.permissions.some(permission => permission.startsWith('report.')),
    'fraud-checker': fraud,
    'create-order': createOrder,
    'create-customer': createCustomer,
    'pos/create': canOpenCounter(auth, true),
    'pos/counter-sales': canOpenCounter(auth),
    'pos/counter-configuration': canOpenCounter(auth),
    'pre-orders/create': region === 'BD' && canCreate('pre_order.create'),
    'create-product': canCreate('product.create') && (!catalogPilot || region === 'BD') &&
      (!connectedCatalog || catalogPilot || canUseConnectedMarket(false)),
    'add-new-category': region === 'BD' && !catalogPilot && canCreate('product.create'),
    'add-new-sub-category': region === 'BD' && !catalogPilot && canCreate('product.create'),
    'business-location/create': canCreate('business_locations.create'),
    'suppliers/create': canCreate('supplier.create'),
    'create-coupon': canCreate('coupon.create'),
    'create-expense': canCreate('expense.create'),
    'barcodes/default-rate': canOperate(staff, 'purchase-rate'),
  };
  const inventoryViews = new Set(smartInventoryTabs(auth).map(([key]) => key));
  function allowed(entry: Entry) {
    const route = entry.path.slice('/dashboard/'.length);
    const destination = resolveLegacy(route.split('/'));
    if (!destination) return false;
    const [, section, view] = destination.path.slice(1).split('/');
    if (!visible.some(id => id === section)) return false;
    if (section === 'content' && view !== 'homepage' && region !== 'BD') return false;
    if (section === 'orders' && view === 'preorders' && region !== 'BD') return false;
    if (entry.permission && !has(staff, entry.permission)) return false;
    if (entry.central && !superAdmin(staff)) return false;
    if (entry.connected && (!connectedCatalog || !canUseConnectedMarket(false))) return false;
    if (entry.pilot && !catalogPilot) return false;
    if (entry.homepage === 'connected' && (!connectedHomepage || !canUseConnectedMarket(true))) return false;
    if (entry.homepage === 'legacy' && connectedHomepage) return false;
    if (Object.hasOwn(special, route)) return special[route];
    if (section === 'inventory' && ['generate-barcodes', 'scan-to-receive', 'barcode-logs'].includes(view)) return inventoryViews.has(view);
    const resource = resources[section]?.[view];
    return resource ? permitted(resource, auth) : true;
  }
  return navigation.map(section => ({
    ...section,
    groups: section.groups.map(group => ({ ...group, entries: group.entries.filter(allowed) })).filter(group => group.entries.length),
  })).filter(section => section.groups.length);
}

