import { api, ApiError, arr, canWrite, mongoId, obj, str, type Session } from './api';
import { has, type Staff } from './sections';
import type { SupplierRecord } from './supplier-fields';

export function supplierWrite(staff: Staff, operation: 'create' | 'update' | 'delete') {
  return canWrite(staff) && has(staff, 'supplier.view') && has(staff, 'supplier.' + operation);
}

function supplierRow(value: unknown): SupplierRecord {
  const row = obj(value);
  return {
    id: str(row._id), name: str(row.name), type: str(row.type),
    contact_id: typeof row.contact_id === 'number' ? String(row.contact_id) : str(row.contact_id),
    phone: str(row.phone), email: str(row.email), address: str(row.address),
    default_payment_terms: str(row.default_payment_terms), tax_info: str(row.tax_info), notes: str(row.notes),
  };
}

export async function supplierDirectory(auth: Session) {
  if (!has(auth.staff, 'supplier.view')) throw new ApiError(403);
  return arr(await api('/supplier', auth.token)).map(obj).filter(row => row.is_deleted !== true && mongoId(str(row._id)))
    .map(supplierRow).sort((a, b) => a.name.localeCompare(b.name));
}

export async function supplierRecord(auth: Session, id: string) {
  if (!has(auth.staff, 'supplier.view')) throw new ApiError(403);
  if (!mongoId(id)) throw new ApiError(404);
  const row = obj(await api('/supplier/' + id, auth.token));
  if (row.is_deleted === true || !row._id) throw new ApiError(404);
  return supplierRow(row);
}
