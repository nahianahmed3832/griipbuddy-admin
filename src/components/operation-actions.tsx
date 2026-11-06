import { api, arr, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { canOperate, operations, pickStatuses, returnStatuses, type Choice, type Field, type OperationId } from '@/lib/operations';
import type { Region } from '@/lib/sections';
import { OperationForm } from './operation-form';

const listOperations: Record<string, OperationId[]> = {
  '/barcode': ['barcode-generate', 'barcode-receive'],
  '/supplier': ['supplier-create'],
  '/pos/sale': ['pos-cash-sale'],
  '/coupon/admin/all': ['coupon-create'],
  '/cms/admin/top-bar-messages': ['announcement-create'],
};

function recordOperations(endpoint: string, record: RecordData, region: Region): OperationId[] {
  switch (endpoint) {
    case '/stocks': return ['stock-adjust', 'stock-transfer'];
    case '/order': {
      const status = str(record.status);
      const actions: OperationId[] = [];
      if (pickStatuses.includes(status)) actions.push('order-pick');
      if (region === 'BD' && record.transfer_to_courier !== true && ['PLACED','PROCESSING','ACCEPTED'].includes(status)) actions.push('courier-dispatch');
      if (returnStatuses.includes(status)) actions.push('order-return');
      if (['IN_TRANSIT', 'DELIVERED', 'HANDED_OVER_TO_COURIER', 'RETURN_REQUESTED'].includes(status)) actions.push('return-pending');
      if (record.transfer_to_courier === true && str(record.tracking_code)
        && ['IN_TRANSIT','HANDED_OVER_TO_COURIER'].includes(status)) actions.push('tracking-refresh');
      return actions;
    }
    case '/purchase': return ['purchase-notes'];
    case '/pos/sale': return region === 'BD' && record.payment_method === 'Cash' && record.payment_status === 'PAID'
      ? ['pos-cash-return'] : [];
    case '/product/admin/variants': return ['variant-price', 'purchase-rate'];
    case '/cms/admin/top-bar-messages': return ['announcement-edit'];
    case '/product/admin/all': return region === 'INTERNATIONAL'
      ? ['product-publication', 'product-coverage'] : ['product-publication'];
    case '/coupon/admin/all': return ['coupon-status'];
    default: return [];
  }
}

function locationChoices(records: unknown[], region: Region): Choice[] {
  return records.map(obj).filter(row => row.region === region && row.is_active !== false && row.is_deleted !== true && mongoId(str(row._id)))
    .map(row => ({ value: str(row._id), label: str(row.business_location_name) || str(row.name) || str(row._id) }));
}

export async function OperationActions({ endpoint, auth, region, record, id }: {
  endpoint: string;
  auth: Session;
  region: Region;
  record?: RecordData;
  id?: string;
}) {
  const candidates = record && id ? recordOperations(endpoint, record, region) : listOperations[endpoint] ?? [];
  const actions = candidates.filter(action => canOperate(auth.staff, action) && (action !== 'pos-cash-sale' || region === 'BD'));
  if (!actions.length) return null;

  const sourceLocations = locationChoices(arr(record?.stocks_by_location).map(row => obj(row).location), region);
  let allLocations: Choice[] = [];
  if (actions.includes('stock-transfer') || actions.includes('barcode-receive') || actions.includes('pos-cash-sale') || actions.includes('courier-dispatch')) {
    const data = obj(await api(url('/business-location', { region, page: '1', limit: '250' }), auth.token));
    allLocations = locationChoices(arr(data.businessLocations), region);
  }
  let suppliers: Choice[] = [];
  let rate: RecordData = {};
  if (actions.includes('purchase-rate')) {
    const [list, defaults] = await Promise.all([
      api('/supplier', auth.token), api(url('/purchase/default/all', { variant: id, limit: '1' }), auth.token),
    ]);
    suppliers = arr(list).map(obj).filter(row => mongoId(str(row._id)) && row.is_deleted !== true)
      .map(row => ({ value: str(row._id), label: str(row.name) }));
    rate = obj(arr(obj(defaults).data)[0]);
  }
  const currencyCodes = new Set(['BDT']);
  if (actions.includes('variant-price') && region === 'INTERNATIONAL') {
    const countries = obj(await api('/country/admin/all?limit=250', auth.token));
    arr(countries.countries).map(row => str(obj(row).currency)).filter(code => /^[A-Z]{3}$/.test(code))
      .forEach(code => currencyCodes.add(code));
  }

  const initial = {
    message: str(record?.message),
    enabled: String(endpoint === '/product/admin/all' ? record?.is_published === true
      : endpoint === '/coupon/admin/all' ? record?.isActive === true : record?.enabled !== false),
    note: str(record?.additional_notes),
    countries: arr(record?.available_countries).map(row => str(obj(row).code) || str(row)).filter(Boolean).join(', '),
    supplier: str(obj(rate.supplier)._id) || str(rate.supplier),
    cost: typeof rate.unit_cost === 'number' ? String(rate.unit_cost) : '',
    discount: String(rate.discount ?? 0), tax: String(rate.tax ?? 0),
  };
  const saleItems = arr(record?.products).map(obj).flatMap(line => {
    const variant = obj(line.selected_variant);
    return mongoId(str(variant._id)) && typeof line.quantity === 'number' && line.quantity > 0
      ? [{ value: str(variant._id), label: str(variant.sku) + ' · ' + line.quantity + ' remaining' }]
      : [];
  });
  return actions.map(action => {
    const { label, description, fields } = operations[action];
    const readyFields = (fields as Field[]).map(field => {
      if (field.name === 'location') return { ...field, choices: ['barcode-receive', 'pos-cash-sale', 'courier-dispatch'].includes(action) ? allLocations : sourceLocations };
      if (field.name === 'destination') return { ...field, choices: allLocations };
      if (field.name === 'supplier') return { ...field, choices: suppliers };
      if (field.name === 'currency') return { ...field, choices: [...currencyCodes].sort().map(code => ({ value: code, label: code })) };
      if (field.name === 'variant') return { ...field, choices: saleItems };
      return field;
    });
    if (readyFields.some(field => field.type === 'select' && !field.choices?.length)) return null;
    return <OperationForm key={action} action={action} label={label} description={description}
      fields={readyFields} region={region} recordId={id} initial={initial}/>;
  });
}
