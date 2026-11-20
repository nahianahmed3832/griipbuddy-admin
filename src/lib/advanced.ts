import { api, ApiError, arr, canWrite, mongoId, obj, str, url, type RecordData, type Session } from './api';
import { findVariantBySku, locationInRegion } from './operations';
import { has, type Region } from './sections';
import { posMethods, validPosDay, type PosReceipt } from './pos';

export function advancedEnabled() {
  return ['preview','integration'].includes(process.env.GRIIP_ADMIN_TARGET ?? '') || (process.env.GRIIP_ADMIN_TARGET === 'fixture'
    && process.env.GRIIP_ADMIN_FIXTURE_WORKSPACE === '1');
}

export const reference = (value: unknown) => str(obj(value)._id) || str(value);
const invalid = (message: string) => new ApiError(400, message);

export async function loadLocations(auth: Session, region: Region) {
  const data = obj(await api(url('/business-location', { limit: '250', region }), auth.token));
  return arr(data.businessLocations).map(obj).filter(row => (str(row.region) || 'BD') === region && mongoId(reference(row)) && row.is_deleted !== true && row.is_active !== false)
    .map(row => ({ value: reference(row), label: str(row.name) || str(row.business_location_name) }));
}

export async function paymentAccounts(auth: Session) {
  const result = await api('/payment-source/published?limit=100', auth.token);
  return arr(Array.isArray(result) ? result : obj(result).data).map(obj)
    .filter(row => mongoId(reference(row)) && row.is_active !== false && row.isActive !== false && row.is_deleted !== true)
    .map(row => ({ value: reference(row), label: str(row.name) || str(row.title) || 'Payment account' }));
}

export function requireWrite(auth: Session, ...permissions: string[]) {
  if (!advancedEnabled() || !canWrite(auth.staff) || permissions.some(permission => !has(auth.staff, permission))) {
    throw new ApiError(403, 'This action requires an authorized isolated workspace administrator.');
  }
}

function money(value: unknown, label: string) {
  const text = typeof value === 'number' ? String(value) : str(value);
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw invalid(label + ' must be a valid amount.');
  return Math.round(Number(text) * 100);
}

function discount(input: unknown, amount: number) {
  const row = obj(input);
  const value = money(row.value ?? '0', 'Discount');
  const type = row.type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FLAT';
  if (type === 'PERCENTAGE' ? value > 10000 : value > amount) throw invalid('Discount exceeds the allowed amount.');
  return { input: { type, value: value / 100 }, minor: type === 'PERCENTAGE' ? Math.round(amount * value / 10000) : value };
}

export async function saveSale(input: RecordData, auth: Session, review = false) {
  const id = str(input.id);
  requireWrite(auth, 'pos.view', id ? 'pos.update' : 'pos.create', 'product.view', 'business_locations.view');
  if ((id && !mongoId(id)) || (!id && !mongoId(str(input.requestId)))) throw invalid('Invalid sale reference.');
  const location = await locationInRegion(str(input.location), 'BD', auth);
  const saleDay = str(input.saleDate);
  if (saleDay && !validPosDay(saleDay)) throw invalid('Select a valid sale date.');
  const previous = id ? obj(await api('/pos/sale/' + id, auth.token)) : {};
  if (id && obj(previous.business_location).region !== 'BD') throw new ApiError(404, 'Sale not found in this region.');
  const lines = arr(input.lines).map(obj);
  const skus = lines.map(line => str(line.sku).trim());
  if (!lines.length || lines.length > 20 || skus.some(sku => !sku || sku.length > 100)
    || new Set(skus.map(sku => sku.toLowerCase())).size !== skus.length) throw invalid('Enter 1 to 20 distinct SKUs.');
  const snapshots = new Map(arr(previous.products).map(obj).map(row => [str(obj(row.selected_variant).sku), row]));
  const products = [];
  let subtotal = 0;
  let regularSubtotal = 0;
  for (const [index, line] of lines.entries()) {
    const quantity = Number(line.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) throw invalid('Enter a whole quantity between 1 and 1000.');
    const existing = snapshots.get(skus[index]);
    const variant = existing ? obj(existing.selected_variant) : await findVariantBySku(skus[index], 'BD', auth);
    const unitPrice = money(variant.regular_price, 'Catalog regular price');
    if (!unitPrice || !str(variant.barcode)) throw invalid('The SKU needs a price and primary barcode.');
    const reduction = discount(line.discount, quantity * unitPrice);
    regularSubtotal += quantity * unitPrice;
    subtotal += quantity * unitPrice - reduction.minor;
    products.push({ product: existing ? reference(existing.product) : reference(variant.product),
      quantity, product_discount: reduction.input, selected_variant: {
        _id: reference(variant), sku: variant.sku, barcode: variant.barcode, attribute_values: obj(variant.attribute_values),
        regular_price: variant.regular_price, sale_price: variant.sale_price ?? variant.regular_price,
      } });
  }
  const overall = discount(input.discount, subtotal);
  const total = subtotal - overall.minor;
  if (review) return { subtotal: subtotal / 100, itemDiscount: (regularSubtotal - subtotal) / 100, discount: overall.minor / 100, total: total / 100 };
  if (typeof input.quotedTotal !== 'number' || Math.round(input.quotedTotal * 100) !== total) {
    throw new ApiError(409, 'Sale totals changed. Review the updated totals before saving.');
  }
  const paid = money(input.paid, 'Amount received');
  if (paid > total && !(input.production === true && input.paymentMethod === 'Cash')) throw invalid('Amount received exceeds the sale total.');
  const account = str(input.paymentAccount);
  const method = str(input.paymentMethod);
  const methods: readonly string[] = input.production === true ? [...posMethods, 'Bank transfer'] : ['Cash', 'Bank transfer', 'Card'];
  if (!methods.includes(method) || (input.production !== true && method !== 'Cash' && !account)) {
    throw invalid('Select a payment method and its accounting source.');
  }
  if (input.production === true ? account.length > 100 || /\p{Cc}/u.test(account)
    : account && (!has(auth.staff, 'expense.view') || !(await paymentAccounts(auth)).some(row => row.value === account))) {
    throw invalid('Select an active payment account.');
  }
  const customer = str(input.customer).trim();
  const createCustomer = !id && input.production === true && input.newCustomer === true;
  if (createCustomer) requireWrite(auth, 'user.create', 'user.view');
  const customerName = createCustomer ? str(input.customerName).trim().slice(0, 100) : undefined;
  if (customer && !/^\+?\d{8,16}$/.test(customer)) throw invalid('Enter an existing customer phone number.');
  const revision = str(input.revision);
  if (id && !revision) throw new ApiError(409, 'Reload this sale before editing.');
  const previousItems = arr(previous.products).map(obj);
  const sameLines = id && products.length === previousItems.length && products.every((line, index) => {
    const previousLine = previousItems[index];
    const previousDiscount = obj(previousLine.product_discount);
    return reference(obj(previousLine.selected_variant)) === line.selected_variant._id
      && previousLine.quantity === line.quantity
      && (str(previousDiscount.type) || 'FLAT') === line.product_discount.type
      && Number(previousDiscount.value ?? 0) === line.product_discount.value;
  });
  const sameDiscount = (str(obj(previous.overall_discount).type) || 'FLAT') === overall.input.type
    && Number(obj(previous.overall_discount).value ?? 0) === overall.input.value;
  const result = obj(await api(id ? '/pos/sale/' + id : '/pos/sale', auth.token, {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify({
      ...(id ? { expected_updated_at: revision } : { request_id: input.requestId }),
      business_location: reference(location),
      ...(!sameLines || !sameDiscount || reference(previous.business_location) !== reference(location) ? { products } : {}),
      customer_phone: customer, existing_customer_only: !createCustomer, ...(createCustomer && { customer_name: customerName || 'New Customer' }),
      ...(saleDay ? { sale_date: new Date(saleDay + 'T12:00:00+06:00').toISOString() } : {}),
      paid_amount: paid / 100, ...(!id || !sameDiscount || !sameLines ? { overall_discount: overall.input } : {}), payment_method: method, payment_account: account || null,
      sale_note: str(input.note).slice(0, 500), payment_note: str(input.paymentNote).slice(0, 500),
    }),
  }));
  const saved = { id: reference(result), invoice: str(result.invoice_number), serial: String(result.sale_serial_id ?? '') };
  if (input.production !== true || input.print !== true) return saved;
  const savedCustomer = customer && mongoId(saved.id)
    ? obj(obj(await api('/pos/sale/' + saved.id, auth.token).catch(() => undefined)).user)
    : {};
  const receipt: PosReceipt = {
    serial: saved.serial, date: str(result.sale_date) || saleDay,
    address: str(obj(location.address).local_address),
    customer: str(savedCustomer.full_name) || 'Walk-in Customer',
    phone: str(result.customer_phone) || customer,
    subtotal: Number(result.sub_total ?? subtotal / 100), discount: Number(result.total_discount ?? overall.minor / 100),
    total: Number(result.total_amount ?? total / 100), paid: Number(result.paid_amount ?? paid / 100),
    lines: arr(result.products).map(obj).map(line => {
      const variant = obj(line.selected_variant);
      return { sku: str(variant.sku), attributes: Object.values(obj(variant.attribute_values)).map(str).filter(Boolean).join(' - '),
        quantity: Number(line.quantity), price: Number(line.total_price) };
    }),
  };
  return { ...saved, receipt };
}

export async function bulkHandover(input: RecordData, auth: Session, region: Region) {
  requireWrite(auth, 'order.view', 'courier.update', 'business_locations.view');
  const orders = arr(input.orderIds).map(str);
  if (!orders.length || orders.length > 50 || orders.some(id => !mongoId(id))) throw invalid('Choose 1 to 50 orders.');
  const location = await locationInRegion(str(input.location), region, auth);
  return api('/business-location/online/order/handover-to-courier/' + reference(location), auth.token,
    { method: 'PATCH', body: JSON.stringify({ orderIds: orders }) });
}
