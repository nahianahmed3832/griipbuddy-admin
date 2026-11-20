import 'server-only';
import { api, ApiError, obj, type Session } from './api';
import { connectedCatalogEndpoint } from './connected-catalog-endpoint';

type RecoveredCatalogReference = { kind: 'product' | 'category'; id: string };
const unavailable = () => new ApiError(503, 'The reviewed catalog pilot fence could not be verified.');

export function scopedCatalogPilotRequested() {
  const flag = process.env.GRIIP_MAIN_ADMIN_CATALOG_SCOPED_PILOT;
  return Boolean((flag && flag !== '0') || process.env.GRIIP_MAIN_ADMIN_CATALOG_REVIEW_DIGEST);
}

export async function verifyScopedCatalogFence(auth: Session, reference?: RecoveredCatalogReference) {
  const expected = process.env.GRIIP_MAIN_ADMIN_CATALOG_REVIEW_DIGEST;
  if (process.env.GRIIP_MAIN_ADMIN_CATALOG_SCOPED_PILOT !== '1' || !expected || !/^[a-f0-9]{64}$/.test(expected)) throw unavailable();
  const query = reference ? '?' + new URLSearchParams({ ...reference, id: reference.id.toLowerCase() }) : '';
  let receipt;
  try {
    connectedCatalogEndpoint(false);
    receipt = obj(await api('/catalog/main-admin-fence' + query, auth.token));
  } catch {
    throw unavailable();
  }
  if (receipt.reviewDigest !== expected || (reference && typeof receipt.managed !== 'boolean')) throw unavailable();
  return receipt.managed === true;
}

export async function verifyScopedLegacyCatalogWrite(auth: Session, reference?: RecoveredCatalogReference) {
  if (!scopedCatalogPilotRequested()) return;
  if (await verifyScopedCatalogFence(auth, reference)) {
    throw new ApiError(409, 'This catalog record is managed in the connected catalog workspace.');
  }
}
