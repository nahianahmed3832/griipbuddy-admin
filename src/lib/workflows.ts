import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { has, superAdmin, type Staff } from './sections';

const rules: [RegExp, string, string][] = [
  [/^(?:overview)$/, 'Overview', 'overview.view'],
  [/^reports/, 'Reporting', 'report.*'],
  [/^(?:pre-orders)/, 'Orders', 'pre_order.view'],
  [/^(?:order|create-order|assigned-orders)/, 'Orders', 'order.view'],
  [/^(?:product-faqs)/, 'Catalog', 'faq.view'],
  [/^(?:product-reviews)/, 'Catalog', 'review.view'],
  [/^(?:products|create-product|update-product|product-details|categor|sub-categor|add-new-category|add-new-sub-category|update-category|update-sub-category|all-brands|create-brand|update-brand|return-polic|add-new-return-policy|update-return-policy)/, 'Catalog', 'product.view'],
  [/^barcodes\/default-rate/, 'Inventory', 'defaults.purchase'],
  [/^barcodes/, 'Inventory', 'barcode.view'],
  [/^(?:business-location|outlets-and-warehouse)/, 'Inventory', 'business_locations.view'],
  [/^(?:suppliers|update-supplier)/, 'Inventory', 'supplier.view'],
  [/^purchase/, 'Inventory', 'purchase.view'],
  [/^(?:check-outlet-stocks|inventory|stock-)/, 'Inventory', 'stock.view'],
  [/^(?:all-countries|create-country|update-country)/, 'Markets', 'product.view'],
  [/^(?:customers|create-customer|password-change-customer|fraud-checker)/, 'Customers', 'user.view'],
  [/^(?:expenses|create-expense|update-expense|expense-|sales-channels|payment-sources)/, 'Accounting', 'expense.view'],
  [/^(?:coupons|create-coupon)/, 'Marketing', 'coupon.view'],
  [/^(?:banner-update|featured-products|header|hero-section|homepage|offer-page)/, 'Storefront content', 'cms.view'],
  [/^pos/, 'Point of sale', 'pos.view'],
  [/^(?:role|add-new-role|update-role)/, 'Staff', 'role.view'],
  [/^(?:staffs|add-new-staff|update-staff|sales-executive)/, 'Staff', 'user.view'],
];
const writeRules: [RegExp, string][] = [
  [/^pre-orders\/create$/, 'pre_order.create'],
  [/^pre-orders\/\[id\]\/edit$/, 'pre_order.update'],
  [/^create-order$/, 'order.create'],
  [/^orders\/edit/, 'order.update'],
  [/^(?:create-product|add-new-(?:category|sub-category|return-policy)|create-brand)/, 'product.create'],
  [/^update-(?:product|category|sub-category|return-policy|brand)/, 'product.update'],
  [/^product-faqs\/add-new-faq/, 'faq.create'],
  [/^barcodes\/generate/, 'barcode.generate'],
  [/^barcodes\/receive/, 'barcode.assign.stock'],
  [/^business-location\/create/, 'business_locations.create'],
  [/^(?:business-location\/edit|inventory\/.*-update)/, 'business_locations.update'],
  [/^stock-adjustment\/create/, 'stock.create'],
  [/^stock-transfer\/create/, 'stock.transfer'],
  [/^purchase\/edit/, 'purchase.update'],
  [/^suppliers\/create/, 'supplier.create'],
  [/^update-supplier/, 'supplier.update'],
  [/^create-coupon/, 'coupon.create'],
  [/^coupons\/\[id\]/, 'coupon.update'],
  [/^create-expense/, 'expense.create'],
  [/^update-expense/, 'expense.update'],
  [/^(?:add-new-staff|create-customer)/, 'user.create'],
  [/^update-staff/, 'user.update'],
  [/^password-change-customer/, 'business_locations.create'],
  [/^add-new-role/, 'role.create'],
  [/^update-role/, 'role.update'],
  [/^pos\/create/, 'pos.create'],
  [/^pos\/edit/, 'pos.update'],
];

export function canOpenWorkflow(name: string, staff: Staff) {
  const rule = rules.find(([matcher]) => matcher.test(name));
  const permission = rule?.[2];
  const write = writeRules.find(([matcher]) => matcher.test(name))?.[1];
  const allowed = permission === 'report.*' ? staff.permissions.some(key => key.startsWith('report.'))
    : permission ? has(staff, permission) : superAdmin(staff);
  if (!allowed || write && !has(staff, write)) return false;
  if (rule?.[1] === 'Staff' && !has(staff, 'role.view')) return false;
  return !/^(?:create-country|update-country|fraud-checker|password-change-customer)/.test(name) || superAdmin(staff);
}

export function workflowRoutes(staff: Staff) {
  const source = readFileSync(join(process.cwd(), 'evidence/legacy-routes.txt'), 'utf8');
  return source.split(/\r?\n/).filter(path => path.startsWith('/dashboard/')).flatMap(path => {
    const name = path.slice('/dashboard/'.length);
    const rule = rules.find(([matcher]) => matcher.test(name));
    const group = rule?.[1] ?? 'System';
    if (!canOpenWorkflow(name, staff)) return [];
    return [{name, group, dynamic: name.includes('['), blocked: name === 'fraud-checker' || /plan|subscription/.test(name) }];
  });
}
