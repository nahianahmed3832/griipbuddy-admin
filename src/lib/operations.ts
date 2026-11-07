import { api, ApiError, arr, canWrite, mongoId, obj, requestApi, str, url, type RecordData, type Session } from './api';
import { barcodePattern, receiptLimit } from './barcode-data';
import { has, type Region, type Staff } from './sections';

export type Choice = { value: string; label: string };
export type Field = {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'decimal' | 'select' | 'date';
  optional?: boolean;
  limit?: number;
  min?: number;
  choices?: Choice[];
};

const textField = (name: string, label: string, limit: number, optional = false): Field => ({ name, label, limit, optional });
const quantity: Field = { name: 'quantity', label: 'Quantity', type: 'number', min: 1, limit: 1000 };
const codes: Field = { name: 'barcodes', label: 'Scanned barcodes', type: 'textarea', limit: 2000 };
const note: Field = { ...textField('note', 'Note', 400, true), type: 'textarea' };
const enabled: Field = {
  name: 'enabled', label: 'Visibility', type: 'select',
  choices: [{ value: 'true', label: 'Visible' }, { value: 'false', label: 'Hidden' }],
};
const location = (name: string, label: string): Field => ({ name, label, type: 'select' });
const amount = (name: string, label: string): Field => ({ name, label, type: 'decimal', min: 0, limit: 10_000_000 });

export const operations = {
  'stock-adjust': {
    label: 'Adjust stock', description: 'Record a quantity correction at a location with existing stock and lots.',
    permissions: ['stock.view', 'stock.create'], fields: [location('location', 'Location'), {
      name: 'direction', label: 'Adjustment', type: 'select',
      choices: [{ value: 'ADDITION', label: 'Add units' }, { value: 'DEDUCTION', label: 'Deduct units' }],
    }, quantity],
  },
  'stock-transfer': {
    label: 'Transfer stock', description: 'Move units between locations in the same region. The inventory API records both movements.',
    permissions: ['stock.view', 'stock.create', 'business_locations.view'],
    fields: [location('location', 'Source location'), location('destination', 'Destination location'), quantity],
  },
  'barcode-generate': {
    label: 'Generate barcodes', description: 'Generate unit labels for an existing variant. Receive the labels to add stock.',
    permissions: ['barcode.view', 'barcode.generate', 'product.view'], fields: [
      textField('sku', 'Variant SKU', 100), { ...quantity, limit: 100 }, note,
    ],
  },
  'barcode-receive': {
    label: 'Receive barcodes', description: 'Enter one code per line. Each variant needs a default purchase rate and supplier.',
    permissions: ['barcode.view', 'barcode.assign.stock', 'business_locations.view'],
    fields: [location('location', 'Receiving location'), { ...codes, limit: receiptLimit * 61 },
      { name: 'purchaseDate', label: 'Purchase date', type: 'date', optional: true }, note],
  },
  'order-note': {
    label: 'Add staff note', description: 'Record an internal note on this order. The order API records the staff member and time.',
    permissions: ['order.view', 'order.update'], fields: [{ ...textField('staffNote', 'Staff note', 500), type: 'textarea' }],
  },
  'order-pick': {
    label: 'Assign order barcodes', description: 'Scan the units reserved for this order. The inventory API records the pick.',
    permissions: ['order.view', 'order.update'], fields: [codes],
  },
  'courier-dispatch': {
    label: 'Dispatch to simulated courier', description: 'Create a test consignment from the selected warehouse.',
    permissions: ['order.view', 'order.update', 'business_locations.view'], fields: [location('location', 'Dispatch location')],
  },
  'order-return': {
    label: 'Process scanned return', description: 'Scan only the returned units. The recovery API records the return and restocks eligible units.',
    permissions: ['order.view', 'order.update', 'order.return'], fields: [codes],
  },
  'return-pending': {
    label: 'Mark pending return', description: 'Move this order to Pending return for staff review.',
    permissions: ['order.view', 'order.update'], fields: [],
  },
  'tracking-refresh': {
    label: 'Refresh simulated tracking', description: 'Ask the local courier simulator for the latest delivery status and update the order.',
    permissions: ['order.view', 'order.update'], fields: [],
  },
  'purchase-notes': {
    label: 'Edit purchase notes', description: 'Update notes on this purchase. The recovered API retains its existing lines and location.',
    permissions: ['purchase.view', 'purchase.update'], fields: [
      { ...textField('note', 'Purchase notes', 1000, true), type: 'textarea' },
    ],
  },
  'purchase-rate': {
    label: 'Set purchase rate', description: 'Set the supplier and default unit costs used when receiving this variant.',
    permissions: ['defaults.purchase', 'purchase.price.view', 'supplier.view', 'product.view'],
    fields: [{ name: 'supplier', label: 'Supplier', type: 'select' }, amount('cost', 'Unit cost'),
      amount('discount', 'Unit discount'), amount('tax', 'Unit tax')],
  },
  'supplier-create': {
    label: 'Add supplier', description: 'Create a supplier in the existing purchasing records.',
    permissions: ['supplier.view', 'supplier.create'], fields: [textField('name', 'Supplier name', 120),
      { name: 'contact', label: 'Contact reference number', type: 'number', min: 1, limit: 99_999_999 },
      textField('phone', 'Phone number', 30, true), textField('address', 'Address', 200, true)],
  },
  'pos-cash-sale': {
    label: 'Record cash sale', description: 'Record a paid walk-in sale for one SKU at a Bangladesh location using its catalog regular price.',
    permissions: ['pos.view', 'pos.create', 'product.view', 'business_locations.view'],
    fields: [location('location', 'Sale location'), textField('sku', 'Variant SKU', 100), quantity, note],
  },
  'pos-cash-return': {
    label: 'Record cash return', description: 'Select an item and quantity from this paid cash sale. The recovery API records the refund and restores stock.',
    permissions: ['pos.view', 'pos.update', 'business_locations.view'],
    fields: [{ name: 'variant', label: 'Sale item', type: 'select' }, quantity],
  },
  'announcement-create': {
    label: 'Add announcement', description: 'Create a message in the existing storefront announcement list.',
    permissions: ['cms.view', 'cms.create'], fields: [textField('message', 'Announcement text', 200), enabled],
  },
  'announcement-edit': {
    label: 'Edit announcement', description: 'Update the message and its visibility.',
    permissions: ['cms.view', 'cms.update'], fields: [textField('message', 'Announcement text', 200), enabled],
  },
  'product-publication': {
    label: 'Edit publication', description: 'Change whether this product is published in its existing storefront region.',
    permissions: ['product.view', 'product.update'], fields: [enabled],
  },
  'product-details': {
    label: 'Edit product details', description: 'Update the description, delivery estimate and search tags for this product.',
    permissions: ['product.view', 'product.update'], fields: [
      { ...textField('description', 'Product description', 4000), type: 'textarea' },
      textField('delivery', 'Delivery estimate', 160, true),
      textField('tags', 'Search tags (comma separated)', 600, true),
    ],
  },
  'product-coverage': {
    label: 'Edit country coverage', description: 'Enter the country codes for this international product, separated by spaces or commas.',
    permissions: ['product.view', 'product.update'], fields: [{ ...textField('countries', 'Country codes', 500, true), type: 'textarea' }],
  },
  'variant-price': {
    label: 'Edit regional price', description: 'Save the regular and sale price for one currency on the existing variant.',
    permissions: ['product.view', 'product.update'],
    fields: [{ name: 'currency', label: 'Currency', type: 'select' }, amount('regular', 'Regular price'), amount('sale', 'Sale price')],
  },
  'coupon-status': {
    label: 'Change coupon status', description: 'Set the desired state of this existing coupon.',
    permissions: ['coupon.view', 'coupon.update'], fields: [{ ...enabled, label: 'Coupon status',
      choices: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] }],
  },
  'coupon-create': {
    label: 'Add coupon', description: 'Create a coupon in the recovered promotion catalog. Dates use UTC.',
    permissions: ['coupon.view', 'coupon.create'], fields: [textField('code', 'Coupon code', 40),
      textField('note', 'Description', 200, true), { name: 'discountType', label: 'Discount type', type: 'select',
        choices: [{ value: 'PERCENTAGE', label: 'Percentage' }, { value: 'FLAT', label: 'Flat amount' }] },
      amount('discount', 'Discount value'), { name: 'start', label: 'Starts on (UTC)', type: 'date' },
      { name: 'end', label: 'Expires on (UTC)', type: 'date' }],
  },
} satisfies Record<string, { label: string; description: string; permissions: string[]; fields: Field[] }>;

export type OperationId = keyof typeof operations;
export const pickStatuses = ['PLACED', 'ACCEPTED', 'PROCESSING', 'IN_REVIEW'];
export const returnStatuses = ['DELIVERED', 'PENDING_RETURN', 'HANDED_OVER_TO_COURIER', 'IN_TRANSIT', 'PARTIAL'];
export function operationId(value: string): value is OperationId {
  return Object.hasOwn(operations, value);
}

export function canOperate(staff: Staff, id: OperationId) {
  if (id === 'courier-dispatch' && process.env.GRIIP_ADMIN_TARGET !== 'integration') return false;
  const fixture = process.env.GRIIP_ADMIN_TARGET === 'fixture';
  const preview = ['preview','integration'].includes(process.env.GRIIP_ADMIN_TARGET ?? '');
  return (fixture || preview) && canWrite(staff)
    && (!['pos-cash-sale', 'pos-cash-return', 'coupon-status'].includes(id) || preview || process.env.GRIIP_ADMIN_FIXTURE_PARITY_WRITES === '1')
    && operations[id].permissions.every(permission => has(staff, permission));
}

function invalid(message: string, status = 400): never {
  throw new ApiError(status, message);
}

function checkedId(value: string, label: string) {
  if (!mongoId(value)) invalid(label + ' is required.');
  return value.toLowerCase();
}

const refId = (record: unknown) => str(obj(record)._id) || str(record);
function barcodeList(value: string) {
  const list = value.split(/[\s,]+/).filter(Boolean);
  if (!list.length || list.length > receiptLimit || list.some(code => !barcodePattern.test(code))) {
    invalid(`Enter between 1 and ${receiptLimit} valid barcode labels.`);
  }
  if (new Set(list).size !== list.length) invalid('Remove duplicate barcodes before continuing.');
  return list;
}

function utcDate(value: string) {
  const day = new Date(value + 'T00:00:00.000Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value) {
    invalid('Enter a valid calendar date.');
  }
  return day;
}

function parseFields(id: OperationId, raw: RecordData) {
  const result: Record<string, string> = {};
  for (const field of operations[id].fields as Field[]) {
    const value = str(raw[field.name]).trim();
    if (!value && !field.optional) invalid(field.label + ' is required.');
    if (value.length > (field.type === 'decimal' || field.type === 'number' ? 12 : field.limit ?? 100)) invalid(field.label + ' is too long.');
    if (field.choices && !field.choices.some(choice => choice.value === value)) invalid('Choose a valid ' + field.label.toLowerCase() + '.');
    if (field.type === 'number' && (!/^\d+$/.test(value) || Number(value) < (field.min ?? 1) || Number(value) > (field.limit ?? 1000))) {
      invalid(field.label + ' is outside the allowed range.');
    }
    if (field.type === 'decimal' && (!/^\d+(\.\d{1,2})?$/.test(value) || Number(value) > (field.limit ?? 0))) {
      invalid(field.label + ' must be a nonnegative amount with up to two decimal places.');
    }
    result[field.name] = value;
  }
  return result;
}

export async function locationInRegion(id: string, region: Region, auth: Session) {
  const record = obj(await api('/business-location/' + checkedId(id, 'Location'), auth.token));
  if (str(record.region) !== region || record.is_active === false || record.is_deleted === true) {
    invalid('Choose an active location in the selected region.');
  }
  return record;
}

async function productInRegion(id: string, region: Region, auth: Session) {
  const product = obj(await api('/product/admin/products/' + checkedId(id, 'Product'), auth.token));
  if ((str(product.region) || 'BD') !== region) invalid('Product is outside the selected region.', 404);
  return product;
}

function mutate(path: string, auth: Session, method: 'POST' | 'PATCH' | 'PUT', body: RecordData) {
  return api(path, auth.token, { method, body: JSON.stringify(body) });
}

export async function findVariantBySku(sku: string, region: Region, auth: Session) {
  const exactSku = sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const data = obj(await api(url('/product/admin/variants', { searchQuery: exactSku, limit: '20' }), auth.token));
  const matches = arr(data.data).map(obj).filter(variant => str(variant.sku) === sku);
  if (matches.length !== 1) invalid('Enter the exact SKU of an existing variant.');
  await productInRegion(refId(matches[0].product), region, auth);
  return obj(await api('/product/variant/single/' + checkedId(refId(matches[0]), 'Variant'), auth.token));
}

export async function executeOperation(id: OperationId, recordId: string, values: RecordData, region: Region, auth: Session) {
  if (!canOperate(auth.staff, id)) invalid('This action requires an authorized fixture administrator.', 403);
  const input = parseFields(id, values);
  switch (id) {
    case 'stock-adjust':
    case 'stock-transfer': {
      const variantId = checkedId(recordId, 'Variant');
      const stock = obj(await api('/stocks/variant/' + variantId, auth.token));
      const variant = obj(stock.variant);
      const productId = refId(variant.product);
      await productInRegion(productId, region, auth);
      const from = await locationInRegion(input.location, region, auth);
      const fromId = refId(from);
      const locationStock = arr(stock.stocks_by_location).map(obj).find(row => refId(row.location) === fromId);
      if (!locationStock) invalid('This variant has no stock record at the source location.');
      if (id === 'stock-transfer') {
        const destination = await locationInRegion(input.destination, region, auth);
        const to = refId(destination);
        if (fromId === to) invalid('Choose a different destination.');
        await mutate('/stocks/transfer', auth, 'POST', {
          from: fromId, to, items: [{ product: productId, variant: variantId, qty: Number(input.quantity) }],
        });
      } else {
        const stockId = refId(obj(arr(locationStock.lots)[0]).stock);
        const barcode = str(variant.barcode);
        if (!barcode || typeof variant.regular_price !== 'number' || typeof variant.sale_price !== 'number') {
          invalid('This variant needs a primary barcode and catalog prices to record the adjustment.');
        }
        await mutate('/stocks/adjustment', auth, 'POST', {
          business_location: fromId, action: input.direction, products: [{
            product: productId, ...(mongoId(stockId) ? { stock: stockId } : {}),
            selected_variant: { _id: variantId, barcode, sku: str(variant.sku), attribute_values: obj(variant.attribute_values),
              regular_price: variant.regular_price, sale_price: variant.sale_price }, quantity: Number(input.quantity),
          }],
        });
      }
      break;
    }
    case 'barcode-generate': {
      await findVariantBySku(input.sku, region, auth);
      const generated = obj(await mutate('/barcode', auth, 'POST', {
        sku: input.sku, product_count: Number(input.quantity), admin_note: input.note,
      }));
      return { barcodes: arr(generated.barcodes).map(row => str(obj(row).barcode)).filter(Boolean) };
    }
    case 'barcode-receive': {
      const barcodes = barcodeList(input.barcodes);
      const receiving = await locationInRegion(input.location, region, auth);
      // Inspect small batches sequentially so a single scan does not fan out into unbounded requests.
      const products = new Set<string>();
      for (const barcode of barcodes) {
        const unit = obj(await api('/barcode/' + barcode, auth.token));
        if (unit.is_used_barcode === true) invalid('A scanned barcode has already been received.', 409);
        products.add(refId(unit.product));
      }
      for (const product of products) await productInRegion(product, region, auth);
      const response = await requestApi(url('/barcode/create-purchase-from-barcodes', { region }), auth.token, {
        method: 'POST', body: JSON.stringify({
          barcodes, business_location: refId(receiving), admin_note: input.note,
          purchase_date: input.purchaseDate ? utcDate(input.purchaseDate).toISOString() : undefined,
        }),
      });
      const result = obj(await response.json().catch(() => null));
      if (!response.ok) throw new ApiError(response.status, str(result.message).slice(0, 320) || undefined);
      if (result.success !== true) throw new ApiError(502);
      const purchase = obj(obj(result.data).purchase);
      return { purchaseId: refId(purchase), purchaseNumber: purchase.purchase_number };
    }
    case 'courier-dispatch':
    case 'order-note':
    case 'order-pick':
    case 'order-return':
    case 'return-pending':
    case 'tracking-refresh': {
      const orderId = checkedId(recordId, 'Order');
      const order = obj(await api('/order/' + orderId, auth.token));
      if ((str(order.region) || 'BD') !== region) invalid('Order is outside the selected region.', 404);
      if (id === 'order-note') {
        await mutate('/order/admin-note/' + orderId, auth, 'PUT', { note: input.staffNote });
      } else if (id === 'courier-dispatch') {
        if (region !== 'BD' || order.transfer_to_courier === true || !['PLACED','PROCESSING','ACCEPTED'].includes(str(order.status))) {
          invalid('Only a confirmed Bangladesh order can be sent to the courier.', 409);
        }
        const location = await locationInRegion(str(input.location), region, auth);
        await mutate('/order/' + orderId + '/status', auth, 'PATCH', { status:'IN_REVIEW', business_location:refId(location) });
      } else if (id === 'return-pending') {
        if (!['IN_TRANSIT','DELIVERED','HANDED_OVER_TO_COURIER','RETURN_REQUESTED'].includes(str(order.status))) {
          invalid('Only an order in transit or delivered can be marked pending return.');
        }
        await mutate('/order/' + orderId + '/mark-pending-return', auth, 'PATCH', {});
      } else if (id === 'tracking-refresh') {
        if (order.transfer_to_courier !== true || !str(order.tracking_code)) invalid('This order has no courier tracking.');
        await api('/order/courier-status-by-order-id/' + orderId, auth.token);
      } else {
        const allowed = id === 'order-pick' ? pickStatuses : returnStatuses;
        if (!allowed.includes(str(order.status))) invalid('The order status does not allow this operation.', 409);
        const endpoint = id === 'order-pick' ? '/process-order-barcodes' : '/process-return-barcodes';
        await mutate('/barcode/' + orderId + endpoint, auth, 'POST', { barcodes: barcodeList(input.barcodes) });
      }
      break;
    }
    case 'purchase-notes': {
      const purchaseId = checkedId(recordId, 'Purchase');
      const purchase = obj(await api('/purchase/' + purchaseId, auth.token));
      await locationInRegion(refId(purchase.business_location), region, auth);
      await mutate('/purchase/' + purchaseId, auth, 'PUT', { additional_notes: input.note });
      break;
    }
    case 'purchase-rate': {
      const variantId = checkedId(recordId, 'Variant');
      const variant = obj(await api('/product/variant/single/' + variantId, auth.token));
      const productId = refId(variant.product);
      const supplierId = checkedId(input.supplier, 'Supplier');
      const supplier = obj(await api('/supplier/' + supplierId, auth.token));
      if (supplier.is_deleted === true) invalid('Choose an active supplier.');
      if (Number(input.discount) > Number(input.cost)) invalid('Discount cannot exceed unit cost.');
      await productInRegion(productId, region, auth);
      const result = obj(await mutate('/purchase/default', auth, 'PUT', {
        variant: variantId, product: productId, supplier: supplierId, unit_cost: Number(input.cost),
        discount: Number(input.discount), tax: Number(input.tax),
      }));
      if (arr(result.successful).length !== 1) invalid('The recovery API did not save this purchase rate.');
      break;
    }
    case 'supplier-create':
      await mutate('/supplier', auth, 'POST', {
        name: input.name, contact_id: Number(input.contact), phone: input.phone, address: input.address,
      });
      break;
    case 'pos-cash-sale': {
      if (region !== 'BD') invalid('This cash sale workflow is available for Bangladesh locations.');
      const branch = await locationInRegion(input.location, region, auth);
      const variant = await findVariantBySku(input.sku, region, auth);
      const regularPrice = variant.regular_price;
      if (typeof regularPrice !== 'number' || !Number.isFinite(regularPrice) || regularPrice <= 0 || !str(variant.barcode)) {
        invalid('This SKU needs a primary barcode and a valid regular price.');
      }
      const quantity = Number(input.quantity);
      await mutate('/pos/sale', auth, 'POST', {
        business_location: refId(branch), payment_method: 'Cash', paid_amount: Math.round(regularPrice * quantity * 100) / 100,
        overall_discount: { type: 'FLAT', value: 0 }, sale_note: input.note,
        products: [{ product: refId(variant.product), quantity, selected_variant: {
          _id: refId(variant), sku: variant.sku, barcode: variant.barcode, attribute_values: obj(variant.attribute_values),
          regular_price: regularPrice, sale_price: variant.sale_price ?? regularPrice,
        } }],
      });
      break;
    }
    case 'pos-cash-return': {
      const saleId = checkedId(recordId, 'Sale');
      const sale = obj(await api('/pos/sale/' + saleId, auth.token));
      await locationInRegion(refId(sale.business_location), region, auth);
      if (region !== 'BD' || sale.payment_method !== 'Cash' || sale.payment_status !== 'PAID') {
        invalid('This workflow requires a paid Bangladesh cash sale.');
      }
      const variantId = checkedId(input.variant, 'Variant');
      const line = arr(sale.products).map(obj).find(row => refId(row.selected_variant) === variantId);
      const quantity = Number(input.quantity);
      if (!line || typeof line.quantity !== 'number' || line.quantity < quantity) invalid('The sale does not contain that many units.');
      await mutate('/pos/sale/return/' + saleId, auth, 'PUT', {
        items: [{ product: refId(line.product), barcode: str(obj(line.selected_variant).barcode), quantity }], processed_by: auth.staff.id,
      });
      break;
    }
    case 'announcement-create':
      await mutate('/cms/admin/top-bar-messages', auth, 'POST', { message: input.message, enabled: input.enabled === 'true' });
      break;
    case 'announcement-edit':
      await mutate('/cms/admin/top-bar-messages/' + checkedId(recordId, 'Announcement'), auth, 'PATCH', {
        message: input.message, enabled: input.enabled === 'true',
      });
      break;
    case 'product-publication': {
      const productId = checkedId(recordId, 'Product');
      await productInRegion(productId, region, auth);
      await mutate('/product/admin/publish/' + productId, auth, 'PATCH', { is_published: input.enabled === 'true' });
      break;
    }
    case 'product-details': {
      const productId = checkedId(recordId, 'Product');
      await productInRegion(productId, region, auth);
      const tags = [...new Map(input.tags.split(',').map(tag => tag.trim()).filter(Boolean)
        .map(tag => [tag.toLowerCase(), tag])).values()];
      if (tags.length > 24 || tags.some(tag => tag.length > 60)) invalid('Use up to 24 search tags of 60 characters each.');
      await mutate('/product/' + productId, auth, 'PATCH', {
        description: input.description, approximately_delivery_time: input.delivery, search_tags: tags,
      });
      break;
    }
    case 'variant-price': {
      const variantId = checkedId(recordId, 'Variant');
      const variant = obj(await api('/product/variant/single/' + variantId, auth.token));
      const productId = refId(variant.product);
      await productInRegion(productId, region, auth);
      const regular = Number(input.regular);
      const sale = Number(input.sale);
      if (regular <= 0 || sale > regular) invalid('Regular price must be positive and sale price cannot exceed it.');
      const countries = obj(await api('/country/admin/all?limit=250', auth.token));
      const currency = input.currency;
      if (currency !== 'BDT' && (region !== 'INTERNATIONAL' || !/^[A-Z]{3}$/.test(currency)
        || !arr(countries.countries).some(row => obj(row).currency === currency))) invalid('Choose a currency configured for this region.');
      const attributes = arr(variant.attributes);
      const attributeValues = obj(variant.attribute_values);
      if (!attributes.length || !Object.keys(attributeValues).length) invalid('This variant needs attribute data before using the existing variant editor.');
      const currentPrices = obj(variant.prices);
      const prices = { ...currentPrices, [currency]: { ...obj(currentPrices[currency]), regular_price: regular, sale_price: sale } };
      await mutate('/product/variant/' + productId, auth, 'PATCH', {
        attributes, variants: [{ _id: variantId, attribute_values: attributeValues, prices,
          regular_price: currency === 'BDT' ? regular : variant.regular_price,
          sale_price: currency === 'BDT' ? sale : variant.sale_price }],
      });
      break;
    }
    case 'product-coverage': {
      const productId = checkedId(recordId, 'Product');
      if (region !== 'INTERNATIONAL') invalid('Country coverage applies to international products.');
      await productInRegion(productId, region, auth);
      const codes = [...new Set(input.countries.toUpperCase().split(/[\s,]+/).filter(Boolean))];
      const countries = obj(await api('/country/admin/all?limit=250', auth.token));
      const selected = arr(countries.countries).map(obj).filter(country => codes.includes(str(country.code)));
      if (selected.length !== codes.length) invalid('Choose only existing country codes.');
      await mutate('/product/' + productId, auth, 'PATCH', { available_countries: selected.map(country => refId(country)) });
      break;
    }
    case 'coupon-status':
      await mutate('/coupon/toggle-status/' + checkedId(recordId, 'Coupon'), auth, 'PATCH', { isActive: input.enabled === 'true' });
      break;
    case 'coupon-create': {
      const start = utcDate(input.start);
      const end = utcDate(input.end);
      end.setUTCHours(23, 59, 59, 999);
      const discount = Number(input.discount);
      if (!/^[A-Z0-9_-]+$/i.test(input.code) || end < start || discount <= 0
        || (input.discountType === 'PERCENTAGE' && discount > 100)) invalid('Check the coupon code, discount and date range.');
      await mutate('/coupon', auth, 'POST', {
        code: input.code.toUpperCase(), description: input.note, discountType: input.discountType,
        discountValue: discount, startAt: start.toISOString(), expireAt: end.toISOString(), isActive: false,
      });
      break;
    }
  }
  return {};
}
