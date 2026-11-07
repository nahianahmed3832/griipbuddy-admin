import { api, ApiError, integratedCheckoutEnabled, mongoId, obj, requestApi, str, type Session } from './api';
import { has, superAdmin, type Staff } from './sections';

const managedViews = {
  catalog: { 'listing-studio': 'Listing studio' },
  inventory: { imports: 'Supplier imports', 'managed-stock': 'Warehouse lots', 'managed-purchases': 'Purchase orders' },
  marketing: { campaigns: 'Campaigns', groups: 'Group buying', rewards: 'Loyalty and referrals', recommendations: 'Recommendations' },
  content: { collections: 'Curated collections' },
  shipping: { sourcing: 'China sourcing', 'shipment-desk': 'Shipment desk' },
  payments: { 'payment-desk': 'Payment desk' },
  markets: { policy: 'Managed pricing', lists: 'Price lists', history: 'Change history', coverage: 'Delivery and payments' },
} as const;

export function managedProfile() {
  return process.env.GRIIP_ADMIN_MANAGED === '1' && ['fixture', 'staging', 'integration'].includes(process.env.GRIIP_ADMIN_TARGET ?? '');
}

export function canManage(staff: Staff) {
  return managedProfile() && superAdmin(staff) && has(staff, 'international.access');
}

const viewPermissions: Record<string, string[]> = {
  'listing-studio':['product.view'],
  imports:['supplier.view'],
  'managed-stock':['stock.view','business_locations.view'],
  'managed-purchases':['purchase.view'],
  campaigns:['coupon.view'],
  groups:['coupon.view'],
  rewards:['coupon.view'],
  recommendations:['cms.view'],
  collections:['cms.view'],
  sourcing:['supplier.view','business_locations.view'],
  'shipment-desk':['order.view'],
  'payment-desk':['order.view'],
  policy:['product.view'],
  lists:['product.view'],
  history:['product.view'],
  coverage:['product.view'],
};

export function managedViewsFor(staff: Staff, section: string) {
  const views = (managedViews as Record<string, Record<string,string>>)[section] ?? {};
  return canManage(staff) ? Object.entries(views).filter(([key]) =>
    viewPermissions[key]?.every(permission => has(staff, permission))) : [];
}

const writeActions = {
  policy: { method: 'PUT', path: (market: string) => '/pricing/admin/markets/' + market, permission: 'product.update' },
  'price-list': { method: 'POST', path: (market: string) => '/pricing/admin/markets/' + market + '/lists', permission: 'product.update' },
  'list-update': { method: 'PATCH', path: (_: string, id: string) => '/pricing/admin/lists/' + id, permission: 'product.update' },
  'price-versions': { method: 'POST', path: (_: string, id: string) => '/pricing/admin/lists/' + id + '/versions', permission: 'product.update' },
  campaign: { method: 'POST', path: (market: string) => '/pricing/admin/markets/' + market + '/campaigns', permission: 'coupon.create' },
  'campaign-update': { method: 'PATCH', path: (_: string, id: string) => '/pricing/admin/campaigns/' + id, permission: 'coupon.update' },
  'group-new': { method: 'POST', path: (market: string) => '/growth/admin/groups/' + market, permission: 'coupon.create' },
  'group-update': { method: 'PUT', path: (market: string, id: string) => '/growth/admin/groups/' + market + '/' + id, permission: 'coupon.update' },
  recommendations: { method: 'PUT', path: (market: string) => '/discovery/admin/rules/' + market, permission: 'cms.update' },
  rewards: { method: 'PUT', path: (market: string) => '/growth/admin/rewards/' + market, permission: 'coupon.update' },
  collection: { method: 'PUT', path: (market: string, slug: string) => '/growth/admin/collections/' + market + '/' + slug, permission: 'cms.update' },
  coverage: { method: 'PUT', path: (market: string) => '/global/admin/markets/' + market, permission: 'product.update' },
  'taxonomy-new': { method: 'POST', path: (_: string, _id: string, depth: string) => '/catalog/categories/' + depth, permission: 'product.create' },
  'taxonomy-edit': { method: 'PATCH', path: (_: string, id: string, depth: string) => '/catalog/categories/' + depth + '/' + id, permission: 'product.update' },
  'listing-new': { method: 'POST', path: () => '/catalog/products', permission: 'product.create' },
  'listing-edit': { method: 'PATCH', path: (_: string, id: string) => '/catalog/products/' + id, permission: 'product.update' },
  'listing-variant': { method: 'POST', path: (_: string, id: string) => '/catalog/products/' + id + '/variants', permission: 'product.update' },
  'listing-price': { method: 'PUT', path: (_: string, id: string, step: string) => '/catalog/products/' + id + '/variants/' + step + '/prices/', permission: 'product.update' },
  'warehouse-new': { method: 'POST', path: () => '/inventory/warehouses', permission: 'business_locations.create' },
  'bin-new': { method: 'POST', path: (_: string, id: string) => '/inventory/warehouses/' + id + '/bins', permission: 'business_locations.update' },
  'lot-bin': { method: 'PATCH', path: (_: string, id: string) => '/inventory/lots/' + id + '/bin', permission: 'stock.create' },
  'purchase-new': { method: 'POST', path: () => '/inventory/purchases', permission: 'purchase.create' },
  'purchase-receive': { method: 'POST', path: (_: string, id: string) => '/inventory/purchases/' + id + '/receipts', permission: 'purchase.update' },
  'purchase-cancel': { method: 'POST', path: (_: string, id: string) => '/inventory/purchases/' + id + '/cancel', permission: 'purchase.update' },
  'source-map': { method: 'POST', path: () => '/global/admin/sources', permission: 'supplier.update' },
  'shipment-new': { method: 'POST', path: () => '/global/admin/shipments', permission: 'order.update' },
  'shipment-action': { method: 'POST', path: (_: string, id: string, step: string) => '/global/admin/shipments/' + id + '/' + step, permission: 'order.update' },
  'payment-action': { method: 'POST', path: (_: string, id: string, step: string) => '/global/admin/payments/' + id + '/' + step, permission: 'order.update' },
  'listing-coverage': { method: 'PUT', path: (_: string, id: string) => '/catalog/products/' + id + '/markets', permission: 'product.update' },
  'listing-transition': { method: 'POST', path: (_: string, id: string, step: string) => '/catalog/products/' + id + '/transitions/' + step, permission: 'product.update' },
  'import-retry': { method: 'POST', path: (_: string, id: string) => '/catalog/imports/' + id + '/retry', permission: 'supplier.update' },
} as const;
export type ManagedAction = keyof typeof writeActions;

export function managedAction(value: string): value is ManagedAction {
  return Object.hasOwn(writeActions, value);
}

export const marketCode = (value: string) => /^[A-Z]{2}$/.test(value);
export const managedSlug = (value: string) => value.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const recordActions: ManagedAction[] = ['list-update', 'price-versions', 'campaign-update', 'group-update', 'listing-edit',
  'listing-variant', 'listing-price', 'listing-coverage', 'listing-transition', 'import-retry', 'bin-new', 'lot-bin',
  'purchase-receive', 'purchase-cancel', 'shipment-action', 'payment-action', 'taxonomy-edit'];
const keyedActions: ManagedAction[] = ['purchase-new','purchase-receive'];
const shipSteps = ['pick','pack','cancel','dispatch','tracking','sync','return'];
const paymentSteps = ['review','collect','reconcile','refunds','disputes/notes'];

export function canManageAction(auth: Session, action: ManagedAction) {
  const required = writeActions[action].permission;
  return canManage(auth.staff) && has(auth.staff, required)
    && !(action === 'coverage' && integratedCheckoutEnabled())
    && (required !== 'order.update' || has(auth.staff, 'order.view'));
}

async function managedResult(response: Response) {
  const result = await response.json().catch(() => null);
  if (response.ok && result?.success === true) return result.data as unknown;
  const status = response.ok ? 502 : response.status;
  const validation = status === 400 || status === 422;
  const firstIssue = Array.isArray(result?.errorMessages) ? obj(result.errorMessages[0]) : {};
  const issue = [str(firstIssue.path), str(firstIssue.message)].filter(Boolean).join(' · ').slice(0,280);
  const message = status === 409 ? 'This record changed or conflicts with an existing record. Reload and review it.'
    : validation ? issue || 'Check the required fields, dates, references and limits.'
      : status === 404 ? 'This record or API is unavailable for the selected market.'
        : status === 403 ? 'Your staff account cannot perform this operation.'
          : 'The API could not confirm the operation. Review the record before retrying.';
  throw new ApiError(status, message);
}

export async function writeManaged(action: ManagedAction, market: string, id: string, step: string, values: Record<string, unknown>, auth: Session, key: string) {
  if (!canManageAction(auth, action)) throw new ApiError(403);
  if (!marketCode(market) || (recordActions.includes(action) && !mongoId(id))
    || (action === 'collection' && !managedSlug(id))
    || (action === 'listing-transition' && !['submit','approve','publish','reopen','archive'].includes(step))
    || (action === 'listing-price' && (!mongoId(step) || !['BDT','USD','EUR','AUD'].includes(String(values.currency))))
    || ((action === 'taxonomy-new' || action === 'taxonomy-edit') && !/^[0-3]$/.test(step))
    || (action === 'shipment-action' && !shipSteps.includes(step))
    || (action === 'payment-action' && !paymentSteps.includes(step))
    || (keyedActions.includes(action) && !/^[a-zA-Z0-9._-]{8,80}$/.test(key))) {
    throw new ApiError(400, 'Choose a valid market, record and operation.');
  }
  if (action === 'coverage' && Object.values(obj(values.methods)).some(method => obj(method).mode !== undefined && obj(method).mode !== 'sandbox')) {
    throw new ApiError(422, 'Use sandbox payment modes in this workspace.');
  }
  const route = writeActions[action];
  let path = route.path(market, id, step);
  const body = { ...values };
  if (action === 'listing-price') {
    path += String(body.currency);
    delete body.currency;
  }
  if (action === 'lot-bin' && !body.bin) body.bin = null;
  if (action === 'payment-action' && step === 'review') {
    if (body.decision === 'approve') {
      const details = obj(await api('/global/admin/payments/' + id, auth.token));
      const payment = obj(details.payment);
      if (payment.provider === 'manual' && (payment.evidenceSubmitted !== true || body.verifiedAmount !== payment.amount
        || !str(body.verifiedReference) || str(body.verifiedReference).toUpperCase() !== str(obj(details.evidence).reference).toUpperCase())) {
        throw new ApiError(422, 'Enter the matching receipt reference and exact amount.');
      }
    }
    delete body.verifiedReference;
    delete body.verifiedAmount;
  }
  if (action === 'shipment-new' || action === 'shipment-action' && step === 'return' || action === 'payment-action' && step === 'refunds') {
    if (!/^[a-f0-9-]{36}$/i.test(key)) throw new ApiError(400, 'A retry reference is required.');
    body.key = key;
  }
  return managedResult(await requestApi(path, auth.token, {
    method: route.method, body: JSON.stringify(body),
  }, keyedActions.includes(action) ? key : undefined));
}

export async function uploadSupplier(supplier: string, form: FormData, key: string, auth: Session) {
  if (!canManage(auth.staff) || !has(auth.staff, 'supplier.update')) throw new ApiError(403);
  if (!mongoId(supplier) || !/^[a-zA-Z0-9._-]{8,80}$/.test(key)) throw new ApiError(400, 'Choose a supplier and an import reference.');
  return managedResult(await requestApi('/catalog/suppliers/' + supplier + '/imports/upload', auth.token,
    { method: 'POST', body: form }, key));
}

export async function uploadAsset(file: File, auth: Session) {
  if (!canManageAction(auth, 'listing-edit')) throw new ApiError(403);
  const form = new FormData();
  form.set('files', file);
  const rows = await managedResult(await requestApi('/catalog/media/upload', auth.token, { method:'POST',body:form }));
  const id = Array.isArray(rows) ? str(obj(rows[0])._id) : '';
  if (!/^[a-f0-9]{64}$/.test(id)) throw new ApiError(502, 'The catalog media API did not return an asset ID.');
  return id;
}

export async function managedRead(path: string, auth: Session) {
  if (!canManage(auth.staff)) throw new ApiError(403);
  return api(path, auth.token);
}
