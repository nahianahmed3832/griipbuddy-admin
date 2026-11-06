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
  [/^pre-orders\/(?:create|\[id\]\/edit)/, 'pre_order.update'],
  [/^(?:create-order|orders\/edit)/, 'order.update'],
  [/^(?:create-product|update-product|add-new-(?:category|sub-category|return-policy)|update-(?:category|sub-category|return-policy|brand)|create-brand)/, 'product.update'],
  [/^product-faqs\/add-new-faq/, 'faq.create'],
  [/^barcodes\/(?:generate|receive)/, 'barcode.generate'],
  [/^(?:business-location\/(?:create|edit)|inventory\/.*-update)/, 'business_locations.update'],
  [/^(?:stock-adjustment\/create|stock-transfer\/create)/, 'stock.create'],
  [/^purchase\/edit/, 'purchase.update'],
  [/^(?:suppliers\/create|update-supplier)/, 'supplier.update'],
  [/^(?:create-coupon|coupons\/\[id\])/, 'coupon.update'],
  [/^(?:create-expense|update-expense)/, 'expense.update'],
  [/^(?:add-new-staff|update-staff|create-customer|password-change-customer)/, 'user.update'],
  [/^(?:add-new-role|update-role)/, 'role.update'],
  [/^pos\/(?:create|edit)/, 'pos.update'],
];

export function workflowRoutes(staff: Staff) {
  const source = readFileSync(join(process.cwd(), 'evidence/legacy-routes.txt'), 'utf8');
  return source.split(/\r?\n/).filter(path => path.startsWith('/dashboard/')).flatMap(path => {
    const name = path.slice('/dashboard/'.length);
    const rule = rules.find(([matcher]) => matcher.test(name));
    const group = rule?.[1] ?? 'System';
    const permission = rule?.[2];
    const write = writeRules.find(([matcher]) => matcher.test(name))?.[1];
    const allowed = permission === 'report.*' ? staff.permissions.some(key => key.startsWith('report.'))
      : permission ? has(staff, permission) : superAdmin(staff);
    if (!allowed || write && !has(staff,write)) return [];
    if (/^(?:create-country|update-country|fraud-checker)/.test(name) && !superAdmin(staff)) return [];
    return [{name, group, dynamic: name.includes('['), blocked: name === 'fraud-checker' || /plan|subscription/.test(name) }];
  });
}
