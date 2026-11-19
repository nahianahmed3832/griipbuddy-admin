import { connectedOrderActions, marketplaceOrderQueues, orderIdentifier, type MarketplaceOrderQueue } from './connected-order-contract';
import { isMarketId, type MarketId } from '../components/connected-catalog-product/markets';

const homepageReads = ['homepage-scopes', 'homepage', 'homepage-preview', 'homepage-references', 'homepage-asset'] as const;
type HomepageReadName = typeof homepageReads[number];
export type CatalogRead = { read: 'categories' | 'products' | 'product' | 'inventory' | 'warehouses' | 'devices' | 'asset' |
  'category-impact' | 'attribute-impact' | 'collection-products' | 'device' | 'search-status' |
  'orders' | 'order' | 'order-cases' | 'order-case' | HomepageReadName; id?: string; q?: string; page?: number;
  menuKey?: string; locale?: string; collectionId?: string; scope?: 'direct' | 'descendants' | 'all' | 'search'; input?: Record<string, unknown>;
  homepageScope?: string; marketId?: string; previewAt?: string; kind?: 'products' | 'categories' | 'collections' | 'media';
  state?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'; source?: 'connected' | 'legacy'; offerMarketId?: MarketId; queue?: MarketplaceOrderQueue; closed?: boolean };
export type CatalogCommand = { action: string; input: Record<string, unknown> };
export type CatalogRequest = CatalogRead | CatalogCommand;
export const catalogRequestLimit = 512 * 1024;
export const catalogUploadLimit = 4 * 1024 * 1024;
export const catalogMediaLimit = 6 * 1024 * 1024;

const reads = new Set(['categories', 'products', 'product', 'inventory', 'warehouses', 'devices', 'category-impact', 'attribute-impact', 'collection-products',
  'device', 'search-status', 'orders', 'order', 'order-cases', 'order-case']);
export const catalogActions = new Set([
  'category.save', 'category.move', 'category.archive', 'category.reorder', 'category.translation',
  'category.presentation', 'category.attribute', 'attribute.save', 'menu.save', 'collection.save',
  'collection.publish', 'collection.products', 'product.assignments', 'product.save', 'product.publish',
  'product.translation', 'product.gallery', 'variant.compatibility', 'device.save', 'offer.save',
  'offer.configure', 'inventory.initialize', 'inventory.route', 'inventory.movement', 'inventory.transfer', 'media.upload',
  'inventory.warehouse.create',
  'homepage.save', 'homepage.publish', 'homepage.restore', 'homepage.inherit', 'homepage.media',
  'search.reconcile', 'search.rebuild', ...connectedOrderActions,
]);

export function isHomepageRequest(request: CatalogRequest) {
  return 'read' in request ? homepageReads.some(read => request.read === read) : request.action.startsWith('homepage.');
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseCatalogRequest(value: unknown): CatalogRequest | null {
  if (!object(value)) return null;
  if (homepageReads.some(read => read === value.read)) {
    const keys = Object.keys(value);
    if (value.read === 'homepage-scopes' && keys.length === 1) return { read: 'homepage-scopes' };
    if (value.read === 'homepage-asset' && keys.every(key => ['read', 'id'].includes(key)) && catalogAssetPath(value.id)) {
      return { read: 'homepage-asset', id: value.id };
    }
    if (typeof value.homepageScope !== 'string' || !/^[a-z][a-z0-9-]{0,15}:[a-zA-Z0-9-]{1,35}$/.test(value.homepageScope)) return null;
    if (value.read === 'homepage' && keys.every(key => ['read', 'homepageScope'].includes(key))) return value as CatalogRead;
    if (value.read === 'homepage-preview' && keys.every(key => ['read', 'homepageScope', 'marketId', 'locale', 'previewAt'].includes(key)) &&
        typeof value.marketId === 'string' && /^[a-z][a-z0-9-]{0,15}$/.test(value.marketId) &&
        typeof value.locale === 'string' && /^[a-zA-Z0-9-]{1,35}$/.test(value.locale) &&
        (value.previewAt === undefined || typeof value.previewAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value.previewAt))) return value as CatalogRead;
    if (value.read === 'homepage-references' && keys.every(key => ['read', 'homepageScope', 'kind', 'q'].includes(key)) &&
        ['products', 'categories', 'collections', 'media'].some(kind => kind === value.kind) &&
        (value.q === undefined || typeof value.q === 'string' && value.q.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value.q))) return value as CatalogRead;
    return null;
  }
  if (value.read === 'asset' && Object.keys(value).every(key => ['read', 'id'].includes(key)) && catalogAssetPath(value.id)) {
    return { read: 'asset', id: value.id };
  }
  const orderDetail = value.read === 'order' || value.read === 'order-case';
  const requestKeys = value.read === 'categories' ? ['read', 'id', 'q', 'page', 'menuKey', 'locale', 'collectionId', 'scope'] :
    value.read === 'attribute-impact' ? ['read', 'input', 'page'] : value.read === 'products' ? ['read', 'q', 'page', 'state', 'source', 'offerMarketId'] :
      value.read === 'search-status' || value.read === 'warehouses' ? ['read'] : value.read === 'device' || orderDetail ? ['read', 'id'] :
        value.read === 'orders' ? ['read', 'queue', 'page'] : value.read === 'order-cases' ? ['read', 'closed', 'page'] : ['read', 'id', 'q', 'page'];
  if (typeof value.read === 'string' && reads.has(value.read) && Object.keys(value).every(key => requestKeys.includes(key)) &&
      [value.collectionId, value.menuKey].every(key => key === undefined || typeof key === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/i.test(key)) &&
      (value.id === undefined || typeof value.id === 'string' && /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]{0,119}$/u.test(value.id)) &&
      (value.scope === undefined || ['direct', 'descendants', 'all', 'search'].some(scope => scope === value.scope)) &&
      (value.state === undefined || ['DRAFT', 'ACTIVE', 'ARCHIVED'].some(state => state === value.state)) &&
      (value.source === undefined || value.source === 'connected' || value.source === 'legacy') &&
      (value.offerMarketId === undefined || isMarketId(value.offerMarketId)) &&
      (value.read !== 'attribute-impact' || object(value.input)) &&
      (value.read !== 'device' || typeof value.id === 'string') &&
      (!orderDetail || typeof value.id === 'string' && orderIdentifier.test(value.id)) &&
      (value.queue === undefined || marketplaceOrderQueues.some(([key]) => key === value.queue)) &&
      (value.closed === undefined || typeof value.closed === 'boolean') &&
      (value.locale === undefined || typeof value.locale === 'string' && /^[A-Za-z0-9-]{0,35}$/.test(value.locale)) &&
      (value.page === undefined || typeof value.page === 'number' && Number.isSafeInteger(value.page) && value.page >= 1 && value.page <= 10_000) &&
      (value.q === undefined || typeof value.q === 'string' && value.q.length <= 120 && !/[\u0000-\u001f\u007f]/.test(value.q))) {
    return value as CatalogRead;
  }
  if (typeof value.action === 'string' && catalogActions.has(value.action) && Object.keys(value).every(key => ['action', 'input'].includes(key)) &&
      object(value.input)) return { action: value.action, input: value.input };
  return null;
}

export function catalogAssetPath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 300 &&
    /^\/(?:media\/[a-f0-9]{64}|(?:catalog|editorial)\/[a-z0-9-]+\.webp)$/.test(value);
}
