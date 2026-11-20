import 'server-only';
import { ApiError } from './api';

export function connectedCatalogEndpoint(homepage: boolean) {
  const raw = homepage ? process.env.GRIIP_MAIN_ADMIN_HOMEPAGE_URL : process.env.GRIIP_MAIN_ADMIN_CATALOG_URL;
  const secret = homepage ? process.env.GRIIP_MAIN_ADMIN_HOMEPAGE_SECRET : process.env.GRIIP_MAIN_ADMIN_CATALOG_SECRET;
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
