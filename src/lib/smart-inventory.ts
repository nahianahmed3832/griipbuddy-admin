import { api, ApiError, arr, obj, requestApi, str, url, type Session } from './api';
import { barcodeConditions, barcodePattern, barcodeStatuses, type BarcodeRow, type BarcodeVariant } from './barcode-data';
import { param, perPage, type Query } from './data';
import { canOperate } from './operations';
import { has, type Region } from './sections';

export const inventoryPath = '/desk/inventory';

export function smartInventoryTabs(auth: Session) {
  if (!has(auth.staff, 'barcode.view')) return [];
  return [
    ['barcodes', 'All Barcodes'],
    ...(canOperate(auth.staff, 'barcode-generate') ? [['generate-barcodes', 'Generate Barcodes']] : []),
    ...(canOperate(auth.staff, 'barcode-receive') ? [['scan-to-receive', 'Scan to Receive']] : []),
    ['barcode-logs', 'Barcode Logs'],
  ];
}

function barcodeRow(input: unknown): BarcodeRow {
  const row = obj(input);
  return {
    barcode: str(row.barcode), sku: str(row.sku), product: str(obj(row.product).name),
    status: str(row.status), condition: str(row.conditions), createdAt: str(row.createdAt),
  };
}

export async function listBarcodes(auth: Session, region: Region, q: Query) {
  if (!has(auth.staff, 'barcode.view')) throw new ApiError(403);
  const sku = (param(q, 'sku') ?? '').trim().slice(0, 100);
  const barcode = (param(q, 'barcode') ?? '').trim();
  const status = param(q, 'status') ?? '';
  const conditions = param(q, 'conditions') ?? '';
  const used = param(q, 'is_used_barcode') ?? '';
  const filters = { region, sku, barcode: barcodePattern.test(barcode) ? barcode : '',
    status: barcodeStatuses.includes(status) ? status : '', conditions: barcodeConditions.includes(conditions) ? conditions : '',
    is_used_barcode: ['true', 'false'].includes(used) ? used : '' };
  const page = Math.min(10000, Math.max(1, Number.parseInt(param(q, 'page') ?? '', 10) || 1));
  if (barcode && !filters.barcode) return { rows: [], total: 0, page, filters };
  const data = obj(await api(url('/barcode', { ...filters, page: String(page), limit: String(perPage) }), auth.token));
  const meta = obj(data.meta);
  if (meta.region !== region) throw new ApiError(502);
  const total = meta.total;
  return { rows: arr(data.data).map(barcodeRow), total: typeof total === 'number' ? total : 0, page, filters };
}

export async function barcodeHistory(code: string, auth: Session, region: Region) {
  if (!barcodePattern.test(code)) throw new ApiError(400, 'Enter a valid barcode.');
  const detail = obj(await api(url('/barcode/' + code, { region }), auth.token));
  if (detail.region !== region) throw new ApiError(502);
  return { unit: barcodeRow(detail), logs: arr(detail.updated_logs).map(obj).reverse() };
}

export async function barcodeVariants(term: string, auth: Session, region: Region): Promise<BarcodeVariant[]> {
  if (!term || term.length > 100) return [];
  const searchQuery = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const data = obj(await api(url('/product/admin/variants', { searchQuery, region, limit: '20' }), auth.token));
  return arr(data.data).map(obj).flatMap(variant => {
    const product = obj(variant.product);
    const sku = str(variant.sku);
    if (!sku || sku.length > 100 || !product._id || (str(product.region) || 'BD') !== region || product.is_deleted === true) return [];
    return [{ sku, name: str(product.name) || sku, options: Object.values(obj(variant.attribute_values)).map(str).filter(Boolean).join(' · ') }];
  });
}

export async function validateReceiptScan(code: string, auth: Session, region: Region) {
  if (!barcodePattern.test(code)) throw new ApiError(400, 'Enter a valid barcode.');
  const response = await requestApi(url('/barcode/check-used/' + code, { region }), auth.token);
  const payload = obj(await response.json().catch(() => null));
  if (!response.ok) throw new ApiError(response.status, str(payload.message).slice(0, 240) || 'This barcode could not be validated.');
  const unit = obj(payload.data);
  if (payload.success !== true || unit.barcode !== code || unit.region !== region) throw new ApiError(502);
  return { barcode: code, sku: str(unit.sku) };
}
