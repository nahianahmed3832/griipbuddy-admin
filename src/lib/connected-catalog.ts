import 'server-only';
import { createHmac, randomUUID } from 'node:crypto';
import { ApiError, getRegion, obj, workspaceWritesEnabled, type Session } from './api';
import type { CatalogRequest } from './connected-catalog-contract';
import { has, superAdmin, type Region } from './sections';

const marketMerchandising = new Set(['category.presentation', 'menu.save', 'collection.publish']);
const orderReads = new Set(['orders', 'order', 'order-cases', 'order-case']);
const orderProgress = new Set(['order.advance', 'order.tracking', 'order.parcel.dispatch', 'order.parcel.tracking']);

export function connectedCatalogConfigured() {
  return Boolean(process.env.GRIIP_MAIN_ADMIN_CATALOG_URL || process.env.GRIIP_MAIN_ADMIN_CATALOG_SECRET);
}

function connectedCatalogEndpoint() {
  const raw = process.env.GRIIP_MAIN_ADMIN_CATALOG_URL;
  const secret = process.env.GRIIP_MAIN_ADMIN_CATALOG_SECRET;
  const profile = process.env.GRIIP_ADMIN_TARGET;
  const protectedDev = profile === 'integration';
  if (!raw || !secret || Buffer.byteLength(secret, 'utf8') < 32 || !['fixture', 'integration'].includes(profile ?? '')) {
    throw new ApiError(503, 'The connected catalog is unavailable in this workspace.');
  }
  if (protectedDev && process.env.GRIIP_ADMIN_PUBLIC_ORIGIN !== 'https://devadmin.griipbuddy.com') {
    throw new ApiError(503, 'The connected catalog requires the protected development admin origin.');
  }
  let endpoint: URL;
  try { endpoint = new URL(raw); } catch { throw new ApiError(503, 'The connected catalog endpoint is invalid.'); }
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.username || endpoint.password ||
      endpoint.search || endpoint.hash || !/^\/(marketplace\/)?api\/internal\/main-admin-catalog$/.test(endpoint.pathname)) {
    throw new ApiError(503, 'The connected catalog requires its verified private endpoint.');
  }
  if (protectedDev && (endpoint.port !== '4401' || endpoint.pathname !== '/marketplace/api/internal/main-admin-catalog')) {
    throw new ApiError(503, 'The protected admin requires the isolated Marketplace development service.');
  }
  return { endpoint, secret };
}

export function connectedCatalogMarket(auth: Session, region: Region) {
  const permitted = getRegion(region, auth.staff);
  if (permitted !== region) throw new ApiError(403, 'This operating region is unavailable for your account.');
  if (permitted === 'BD') return 'bd';
  if (process.env.GRIIP_MAIN_ADMIN_CATALOG_INTERNATIONAL_MARKET !== 'us') {
    throw new ApiError(403, 'This region needs a verified connected catalog market assignment.');
  }
  return 'us';
}

export function mayEditConnectedTaxonomy(auth: Session) {
  return superAdmin(auth.staff) && workspaceWritesEnabled() && has(auth.staff, 'product.update');
}

export function mayEditConnectedMerchandising(auth: Session) {
  return workspaceWritesEnabled() && (has(auth.staff, 'cms.update') || has(auth.staff, 'product.update'));
}

export function mayEditConnectedOffers(auth: Session) {
  return workspaceWritesEnabled() && has(auth.staff, 'product.view') && has(auth.staff, 'product.update');
}

export function mayEditConnectedStock(auth: Session) {
  return workspaceWritesEnabled() && has(auth.staff, 'product.view') &&
    has(auth.staff, 'stock.view') && has(auth.staff, 'stock.create');
}

export function mayCreateConnectedWarehouse(auth: Session) {
  return workspaceWritesEnabled() && superAdmin(auth.staff) && has(auth.staff, 'stock.view') && has(auth.staff, 'business_locations.create');
}

export function mayReadConnectedOrders(auth: Session, returns = false) {
  return has(auth.staff, 'order.view') && (!returns || (superAdmin(auth.staff) && has(auth.staff, 'order.return')));
}

export function mayEditConnectedOrder(auth: Session, action: string) {
  const { staff } = auth;
  if (!workspaceWritesEnabled() || !mayReadConnectedOrders(auth)) return false;
  if (orderProgress.has(action)) return has(staff, 'order.update') || has(staff, 'operations.pack');
  if (!has(staff, 'order.update')) return false;
  if (action === 'order.parcel.receive') return has(staff, 'order.return');
  if (!superAdmin(staff)) return false;
  return action === 'order.case' ? has(staff, 'order.return') : action === 'order.cancel' || action === 'order.collect';
}

function authorizeRequest(auth: Session, request: CatalogRequest) {
  if ('read' in request) {
    if (orderReads.has(request.read)) {
      if (!mayReadConnectedOrders(auth, request.read === 'order-cases' || request.read === 'order-case')) {
        throw new ApiError(403, 'Order access is unavailable.');
      }
      return;
    }
    const stockRead = request.read === 'inventory' || request.read === 'warehouses';
    if (!has(auth.staff, stockRead ? 'stock.view' : 'product.view')) throw new ApiError(403, 'Catalog access is unavailable.');
    if (['asset', 'category-impact', 'attribute-impact', 'collection-products', 'device', 'devices', 'search-status', 'warehouses'].includes(request.read) && !superAdmin(auth.staff)) {
      throw new ApiError(403, 'Central catalog access is required for this view.');
    }
    return;
  }
  const { staff } = auth;
  const { action, input } = request;
  if (action.startsWith('order.')) {
    const trackingRefusal = (action === 'order.tracking' || action === 'order.parcel.tracking') && input.status === 'REFUSED';
    if (!mayEditConnectedOrder(auth, action) || (trackingRefusal && !mayReadConnectedOrders(auth, true))) {
      throw new ApiError(403, 'Order editing is unavailable.');
    }
    return;
  }
  if (action === 'inventory.warehouse.create') {
    if (!mayCreateConnectedWarehouse(auth)) throw new ApiError(403, 'Warehouse setup access is unavailable.');
    return;
  }
  if (!workspaceWritesEnabled() || !has(staff, 'product.view')) throw new ApiError(403, 'Catalog editing is unavailable.');
  if (action.startsWith('inventory.')) {
    if (!mayEditConnectedStock(auth)) throw new ApiError(403, 'Stock movement access is unavailable.');
    return;
  }
  if (action.startsWith('offer.')) {
    if (!mayEditConnectedOffers(auth)) throw new ApiError(403, 'Offer editing is unavailable.');
    return;
  }
  if (marketMerchandising.has(action)) {
    if (!mayEditConnectedMerchandising(auth)) throw new ApiError(403, 'Market merchandising access is unavailable.');
    return;
  }
  if (action === 'media.upload') {
    if (!superAdmin(staff) || !['product.create', 'product.update'].some(permission => has(staff, permission))) {
      throw new ApiError(403, 'Central catalog access is required to upload images.');
    }
    return;
  }
  const create = (action === 'category.save' || action === 'product.save') && (input.revision === null || input.expectedRevision === null);
  if (!superAdmin(staff) || !has(staff, create ? 'product.create' : action === 'category.archive' ? 'product.delete' : 'product.update')) {
    throw new ApiError(403, 'Central catalog access is required for this change.');
  }
}

export async function connectedCatalog<T = unknown>(auth: Session, region: Region, request: CatalogRequest): Promise<T> {
  authorizeRequest(auth, request);
  const marketId = connectedCatalogMarket(auth, region);
  if (request.input?.marketId !== undefined && request.input.marketId !== marketId) {
    throw new ApiError(409, 'Select the intended operating region before saving.');
  }
  const { endpoint, secret } = connectedCatalogEndpoint();
  const body = JSON.stringify({ issuedAt: Date.now(), nonce: randomUUID(), legacyId: auth.staff.id,
    central: superAdmin(auth.staff), marketId, request });
  const signature = createHmac('sha256', secret).update('griip-main-admin-catalog-v1\n').update(body).digest('hex');
  let response: Response;
  try {
    const timeout = 'action' in request && request.action === 'search.rebuild' ? 100_000 : 20_000;
    response = await fetch(endpoint, { method: 'POST', body, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeout),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-griip-catalog-signature': signature } });
  } catch { throw new ApiError(503, 'The connected catalog could not be reached. Try again.'); }
  const payload = obj(await response.json().catch(() => null));
  if (!response.ok || !Object.hasOwn(payload, 'data')) {
    const issue = obj(payload.error);
    const detail = typeof payload.error === 'string' ? payload.error : issue.message;
    throw new ApiError(response.ok ? 502 : response.status,
      response.status < 500 && typeof detail === 'string' ? detail.slice(0, 400) : 'The connected catalog could not complete this request.');
  }
  const data = payload.data;
  if ('read' in request && request.read === 'product' && !has(auth.staff, 'stock.view')) {
    const product = obj(data);
    if (product.commerce) {
      return { ...product, commerce: { ...obj(product.commerce), warehouses: [], pools: [], movements: [], allocations: [],
        hasRestrictedPools: false } } as T;
    }
  }
  if ('read' in request && request.read === 'order' && !mayReadConnectedOrders(auth, true)) {
    return { ...obj(data), cases: [] } as T;
  }
  return data as T;
}
