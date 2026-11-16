import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { has, superAdmin, type Staff } from './sections';
import { legacyDestinations, legacyDirectory } from './legacy-destinations';

const rules: [RegExp, string, string][] = [
  [/^(?:overview)$/, 'Overview', 'overview.view'],
  [/^reports/, 'Reporting', 'report.*'],
  [/^(?:pre-orders)/, 'Orders', 'pre_order.view'],
  [/^(?:order|create-order|assigned-orders|fraud-checker|sales-executive)/, 'Orders', 'order.view'],
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
  [/^(?:customers|create-customer|password-change-customer)/, 'Customers', 'user.view'],
  [/^(?:expenses|create-expense|update-expense|expense-|sales-channels|payment-sources)/, 'Accounting', 'expense.view'],
  [/^(?:coupons|create-coupon)/, 'Marketing', 'coupon.view'],
  [/^(?:banner-update|featured-products|header|hero-section|homepage|offer-page)/, 'Storefront content', 'cms.view'],
  [/^pos/, 'Point of sale', 'pos.view'],
  [/^(?:role|add-new-role|update-role)/, 'Staff', 'role.view'],
  [/^(?:staffs|add-new-staff|update-staff)/, 'Staff', 'user.view'],
];
const writeRules: [RegExp, string][] = [
  [/^pre-orders\/create$/, 'pre_order.create'],
  [/^pre-orders\/\[id\]\/edit$/, 'pre_order.update'],
  [/^create-order$/, 'order.create'], [/^orders\/edit/, 'order.update'],
  [/^(?:create-product|add-new-(?:category|sub-category|return-policy)|create-brand)$/, 'product.create'],
  [/^update-(?:product|category|sub-category|return-policy|brand)/, 'product.update'],
  [/^product-faqs\/add-new-faq/, 'faq.create'],
  [/^barcodes\/generate$/, 'barcode.generate'],
  [/^barcodes\/receive$/, 'barcode.assign.stock'],
  [/^business-location\/create$/, 'business_locations.create'],
  [/^(?:business-location\/edit)/, 'business_locations.update'],
  [/^(?:stock-adjustment\/create|stock-transfer\/create|inventory\/.*-update)/, 'stock.create'],
  [/^purchase\/edit/, 'purchase.update'],
  [/^suppliers\/create$/, 'supplier.create'], [/^update-supplier/, 'supplier.update'],
  [/^create-coupon$/, 'coupon.create'],
  [/^create-expense$/, 'expense.create'], [/^update-expense/, 'expense.update'],
  [/^(?:add-new-staff|create-customer)$/, 'user.create'], [/^(?:update-staff|password-change-customer)/, 'user.update'],
  [/^add-new-role$/, 'role.create'], [/^update-role/, 'role.update'],
  [/^pos\/create$/, 'pos.create'], [/^pos\/edit/, 'pos.update'],
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
    if (/^(?:create-country|update-country|password-change-customer)/.test(name) && !superAdmin(staff)) return [];
    const destination = legacyDestinations[name];
    const dynamic = name.includes('[');
    return [{ name, group, dynamic, href: destination?.path ? (dynamic ? legacyDirectory(destination) : '/dashboard/' + name) : undefined,
      pending: destination?.pending }];
  });
}
