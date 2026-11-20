import 'server-only';
import { createHmac, randomUUID } from 'node:crypto';
import { ApiError, getRegion, obj, workspaceWritesEnabled, type Session } from './api';
import { isMarketId, markets, type MarketId } from '../components/connected-catalog-product/markets';
import { isHomepageRequest, type CatalogRequest } from './connected-catalog-contract';
import { connectedCatalogEndpoint } from './connected-catalog-endpoint';
import { has, superAdmin, type Region } from './sections';
import { scopedCatalogPilotRequested, verifyScopedCatalogFence } from './scoped-catalog-pilot';

const marketMerchandising = new Set(['category.presentation', 'menu.save', 'collection.publish']);
const orderReads = new Set(['orders', 'order', 'order-cases', 'order-case']);
const orderProgress = new Set(['order.advance', 'order.tracking', 'order.parcel.dispatch', 'order.parcel.tracking',
  'order.parcel.prepare', 'order.parcel.split', 'order.parcel.reference', 'order.parcel.exception', 'order.parcel.refresh']);

export function connectedCatalogConfigured() {
  return Boolean(process.env.GRIIP_MAIN_ADMIN_CATALOG_URL || process.env.GRIIP_MAIN_ADMIN_CATALOG_SECRET);
}

export function usesConnectedCatalog(lane?: string) {
  return scopedCatalogPilotRequested() ? lane === 'connected' : connectedCatalogConfigured();
}

export function legacyCatalogAuthoringRetired() {
  return connectedCatalogConfigured() && !scopedCatalogPilotRequested();
}

export function connectedHomepageConfigured() {
  if (process.env.GRIIP_MAIN_ADMIN_HOMEPAGE_ENABLED !== '1') return false;
  return process.env.GRIIP_ADMIN_TARGET === 'fixture' || (process.env.GRIIP_ADMIN_TARGET === 'integration' &&
    process.env.GRIIP_ADMIN_PUBLIC_ORIGIN === 'https://devadmin.griipbuddy.com');
}

export function connectedCatalogMarket(auth: Session, region: Region, homepage = false): MarketId {
  const permitted = getRegion(region, auth.staff);
  if (permitted === 'BD') return 'bd';
  const international = homepage ? process.env.GRIIP_MAIN_ADMIN_HOMEPAGE_INTERNATIONAL_MARKET : process.env.GRIIP_MAIN_ADMIN_CATALOG_INTERNATIONAL_MARKET;
  if (!isMarketId(international) || markets[international].countryCode === 'BD') {
    throw new ApiError(403, 'This region needs a verified connected catalog market assignment.');
  }
  return international;
}

function validateRequestMarket(request: CatalogRequest, marketId: MarketId, central: boolean) {
  if ('read' in request) {
    const requestedMarket = request.read === 'products' ? request.offerMarketId : request.marketId;
    if (requestedMarket !== undefined && !isMarketId(requestedMarket)) throw new ApiError(400, 'Choose a supported market.');
    if (!central && requestedMarket !== undefined && requestedMarket !== marketId) {
      throw new ApiError(403, 'Choose the current market for this view.');
    }
  }
  if (request.input?.marketId !== undefined && request.input.marketId !== marketId) {
    throw new ApiError(409, 'Select the intended operating region before saving.');
  }
  if (request.input?.currency !== undefined && request.input.currency !== markets[marketId].currency) {
    throw new ApiError(422, 'The currency does not match the selected market.');
  }
}

export function mayEditConnectedHomepage(auth: Session) {
  return workspaceWritesEnabled() && has(auth.staff, 'cms.view') && has(auth.staff, 'cms.update');
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

export function mayReviewSellerListings(auth: Session) {
  return has(auth.staff, 'product.view') && has(auth.staff, 'product.update');
}

function listingReviewRequest(request: CatalogRequest) {
  return 'read' in request ? request.read === 'seller-listing-reviews' : request.action === 'seller-listing.review';
}

function exchangeRequest(request: CatalogRequest) {
  return 'read' in request ? request.read === 'catalog-exchange' : request.action.startsWith('catalog.exchange.');
}

export function mayUseCatalogExchange(auth: Session) {
  return !scopedCatalogPilotRequested() && superAdmin(auth.staff) && has(auth.staff, 'product.view');
}

function sellerOperationsRequest(request: CatalogRequest) {
  return 'read' in request ? ['seller-hub', 'seller-verification'].includes(request.read) :
    ['seller-hub.command', 'seller-verification.command'].includes(request.action);
}

export function mayUseConnectedSellerOperations(auth: Session) {
  return connectedCatalogConfigured() && superAdmin(auth.staff) && has(auth.staff, 'user.view');
}

function authorizeRequest(auth: Session, request: CatalogRequest) {
  if (sellerOperationsRequest(request)) {
    if (!mayUseConnectedSellerOperations(auth) || ('action' in request && !workspaceWritesEnabled())) {
      throw new ApiError(403, 'Seller operations are unavailable.');
    }
    return;
  }
  if (exchangeRequest(request)) {
    if (!mayUseCatalogExchange(auth) || ('action' in request && (!workspaceWritesEnabled() || !has(auth.staff, 'product.create')))) {
      throw new ApiError(403, 'Central catalog exchange access is unavailable.');
    }
    return;
  }
  if (listingReviewRequest(request)) {
    if (!mayReviewSellerListings(auth) || ('action' in request && !workspaceWritesEnabled())) {
      throw new ApiError(403, 'Seller listing review access is unavailable.');
    }
    return;
  }
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
  const homepage = isHomepageRequest(request);
  if (homepage) {
    if (!connectedHomepageConfigured()) throw new ApiError(404, 'The connected Homepage is unavailable.');
    if (!has(auth.staff, 'cms.view') || ('action' in request && !mayEditConnectedHomepage(auth))) {
      throw new ApiError(403, 'Homepage access is unavailable for your account.');
    }
  } else {
    authorizeRequest(auth, request);
  }
  const review = listingReviewRequest(request);
  if (review && getRegion(region, auth.staff) !== region) throw new ApiError(403, 'You do not have access to this market.');
  const marketId = connectedCatalogMarket(auth, region, homepage);
  const central = superAdmin(auth.staff);
  validateRequestMarket(request, marketId, central);
  if (!homepage && !review && !sellerOperationsRequest(request) && scopedCatalogPilotRequested() && 'action' in request && !request.action.startsWith('order.')) {
    await verifyScopedCatalogFence(auth);
  }
  const { endpoint, secret } = connectedCatalogEndpoint(homepage);
  const body = JSON.stringify({ issuedAt: Date.now(), nonce: randomUUID(), legacyId: auth.staff.id, central, marketId, request });
  const signature = createHmac('sha256', secret).update('griip-main-admin-catalog-v1\n').update(body).digest('hex');
  let response: Response;
  try {
    const timeout = 'action' in request && request.action === 'search.rebuild' ? 100_000 : 20_000;
    response = await fetch(endpoint, { method: 'POST', body, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(timeout),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-griip-catalog-signature': signature,
        ...(homepage && { 'x-griip-admin-channel': 'homepage' }) } });
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
