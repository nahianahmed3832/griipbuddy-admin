import 'server-only';
import { createHmac, randomUUID } from 'node:crypto';
import { ApiError, getRegion, obj, workspaceWritesEnabled, type Session } from './api';
import { isConnectedMarketplaceOrderRequest, isHomepageRequest, isMarketplaceRequest, type CatalogRequest } from './connected-catalog-contract';
import { isProtectedDevAdminOrigin } from './dev-admin-profile';
import { has, superAdmin, type Region } from './sections';

const marketMerchandising = new Set(['category.presentation', 'menu.save', 'collection.publish']);
const orderProgress = new Set(['order.advance', 'order.tracking', 'order.parcel.dispatch', 'order.parcel.tracking',
  'order.parcel.split', 'order.parcel.reference', 'order.parcel.exception', 'order.parcel.refresh']);

export function connectedCatalogConfigured() {
  return Boolean(process.env.GRIIP_MAIN_ADMIN_CATALOG_URL || process.env.GRIIP_MAIN_ADMIN_CATALOG_SECRET);
}

export function connectedHomepageConfigured() {
  if (process.env.GRIIP_MAIN_ADMIN_HOMEPAGE_ENABLED !== '1') return false;
  return process.env.GRIIP_ADMIN_TARGET === 'fixture' || (process.env.GRIIP_ADMIN_TARGET === 'integration' &&
    isProtectedDevAdminOrigin());
}

export function connectedMarketplaceConfigured() {
  return process.env.GRIIP_MAIN_ADMIN_MARKETPLACE_ENABLED === '1' && connectedHomepageConfigured() &&
    (process.env.GRIIP_ADMIN_TARGET === 'fixture' || process.env.GRIIP_ADMIN_PUBLIC_ORIGIN === 'https://admindev.griipbuddy.com');
}

export function connectedMarketplaceOrdersConfigured() {
  return connectedCatalogConfigured() || connectedMarketplaceConfigured();
}

type BridgeChannel = 'catalog' | 'homepage' | 'marketplace';

function connectedCatalogEndpoint(channel: BridgeChannel) {
  const raw = channel === 'catalog' ? process.env.GRIIP_MAIN_ADMIN_CATALOG_URL : process.env.GRIIP_MAIN_ADMIN_HOMEPAGE_URL;
  const secret = channel === 'marketplace' ? process.env.GRIIP_MAIN_ADMIN_MARKETPLACE_SECRET
    : channel === 'homepage' ? process.env.GRIIP_MAIN_ADMIN_HOMEPAGE_SECRET : process.env.GRIIP_MAIN_ADMIN_CATALOG_SECRET;
  const profile = process.env.GRIIP_ADMIN_TARGET;
  const protectedDev = profile === 'integration';
  if (!raw || !secret || Buffer.byteLength(secret, 'utf8') < 32 || !['fixture', 'integration'].includes(profile ?? '')) {
    throw new ApiError(503, 'The connected catalog is unavailable in this workspace.');
  }
  if (protectedDev && !isProtectedDevAdminOrigin()) {
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

export function connectedCatalogMarket(auth: Session, region: Region, homepage = false) {
  const permitted = getRegion(region, auth.staff);
  if (permitted !== region) throw new ApiError(403, 'This operating region is unavailable for your account.');
  if (permitted === 'BD') return 'bd';
  const international = homepage ? process.env.GRIIP_MAIN_ADMIN_HOMEPAGE_INTERNATIONAL_MARKET : process.env.GRIIP_MAIN_ADMIN_CATALOG_INTERNATIONAL_MARKET;
  if (international !== 'us') {
    throw new ApiError(403, 'This region needs a verified connected catalog market assignment.');
  }
  return 'us';
}

export function mayEditConnectedHomepage(auth: Session) {
  return workspaceWritesEnabled() && has(auth.staff, 'cms.view') && has(auth.staff, 'cms.update');
}

export function mayReadConnectedMarketplace(auth: Session) {
  return superAdmin(auth.staff);
}

export function mayManageConnectedMarketplace(auth: Session) {
  return mayReadConnectedMarketplace(auth) && workspaceWritesEnabled();
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

export function mayUseConnectedMarketplaceOrders(auth: Session, returns = false) {
  return mayReadConnectedOrders(auth, returns) &&
    (connectedCatalogConfigured() || (connectedMarketplaceConfigured() && mayReadConnectedMarketplace(auth)));
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
    if (isConnectedMarketplaceOrderRequest(request)) {
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
  const homepage = isHomepageRequest(request);
  const marketplaceManagement = isMarketplaceRequest(request);
  const marketplaceOrder = !connectedCatalogConfigured() && connectedMarketplaceConfigured() && isConnectedMarketplaceOrderRequest(request);
  const marketplace = marketplaceManagement || marketplaceOrder;
  if (marketplaceManagement) {
    if (!connectedMarketplaceConfigured()) throw new ApiError(404, 'Marketplace management is unavailable.');
    if (!mayReadConnectedMarketplace(auth) || ('action' in request && !mayManageConnectedMarketplace(auth))) {
      throw new ApiError(403, 'Central owner access is required for Marketplace management.');
    }
  } else if (marketplaceOrder) {
    if (!mayUseConnectedMarketplaceOrders(auth)) throw new ApiError(403, 'Marketplace order access is unavailable.');
    authorizeRequest(auth, request);
  } else if (homepage) {
    if (!connectedHomepageConfigured()) throw new ApiError(404, 'The connected Homepage is unavailable.');
    if (!has(auth.staff, 'cms.view') || ('action' in request && !mayEditConnectedHomepage(auth))) {
      throw new ApiError(403, 'Homepage access is unavailable for your account.');
    }
  } else authorizeRequest(auth, request);
  const marketId = connectedCatalogMarket(auth, region, homepage || marketplace);
  if (request.input?.marketId !== undefined && request.input.marketId !== marketId) {
    throw new ApiError(409, 'Select the intended operating region before saving.');
  }
  const channel = marketplace ? 'marketplace' : homepage ? 'homepage' : 'catalog';
  const { endpoint, secret } = connectedCatalogEndpoint(channel);
  const body = JSON.stringify({ issuedAt: Date.now(), nonce: randomUUID(), legacyId: auth.staff.id,
    central: superAdmin(auth.staff), marketId, request });
  const signature = createHmac('sha256', secret).update(marketplace ? 'griip-main-admin-marketplace-v1\n' : 'griip-main-admin-catalog-v1\n')
    .update(body).digest('hex');
  let response: Response;
  try {
    const timeout = 'action' in request && request.action === 'search.rebuild' ? 100_000 : 20_000;
    response = await fetch(endpoint, { method: 'POST', body, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeout),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-griip-catalog-signature': signature,
        ...(channel !== 'catalog' && { 'x-griip-admin-channel': channel }) } });
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
    const history = Array.isArray(product.history) ? product.history.filter(entry => {
      const { stock, label } = obj(entry);
      // Older Marketplace revisions identify stock rows by label.
      return stock !== true && !(typeof label === 'string' && label.startsWith('Stock '));
    }) : [];
    const commerce = product.commerce ? { ...obj(product.commerce), warehouses: [], pools: [], movements: [], allocations: [],
      hasRestrictedPools: false } : product.commerce;
    return { ...product, history, commerce } as T;
  }
  if ('read' in request && request.read === 'order' && !mayReadConnectedOrders(auth, true)) {
    return { ...obj(data), cases: [] } as T;
  }
  return data as T;
}
