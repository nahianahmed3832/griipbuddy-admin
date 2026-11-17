import 'server-only';
import { api, ApiError, arr, canWrite, mongoId, obj, requestApi, str, url, type RecordData, type Session } from './api';
import { reference } from './advanced';
import { currencies, productFields, registries, type EditorFields, type Registry } from './catalog-edit-fields';
import { has, superAdmin, type Region } from './sections';

const invalid = (message: string) => new ApiError(400, message);
const routes = {
  brands: { view: 'product.view', create: 'product.create', edit: 'product.update', delete: 'product.delete', base: '/brand' },
  faqs: { view: 'faq.view', create: 'faq.create', edit: 'faq.update', delete: 'faq.delete', base: '/faq/admin' },
  reviews: { view: 'review.view', create: 'review.create', edit: 'review.update', delete: 'review.delete', base: '/review/admin' },
  policies: { view: 'product.view', create: 'product.create', edit: 'product.update', delete: 'product.delete', base: '/return-policy' },
  countries: { view: 'product.view', create: 'manage-permissions', edit: 'manage-permissions', delete: 'manage-permissions', base: '/country' },
} as const;
const registryRead = { brands: '/brand', faqs: '/faq', reviews: '/review', policies: '/return-policy', countries: '/country' };

export function canEditRegistry(kind: Registry, action: 'create' | 'edit' | 'delete', auth: Session) {
  return canWrite(auth.staff) && has(auth.staff, routes[kind].view) && has(auth.staff, routes[kind][action]);
}
export function canEditProduct(action: 'create' | 'edit' | 'delete', auth: Session) {
  const grant = { create: 'product.create', edit: 'product.update', delete: 'product.delete' }[action];
  return canWrite(auth.staff) && has(auth.staff, 'product.view') && has(auth.staff, grant);
}
async function saved(path: string, auth: Session, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  const result = await requestApi(path, auth.token, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  if (result.status === 204) return null;
  const payload = obj(await result.json().catch(() => null));
  if (!result.ok || payload.success !== true) {
    const status = result.ok ? 502 : result.status;
    const issue = obj(arr(payload.errorMessages)[0]);
    const detail = [str(issue.path), str(issue.message)].filter(Boolean).join(': ').slice(0, 250);
    const message = status === 409 ? 'This change conflicts with an existing record or stock movement.' :
      [400, 422].includes(status) ? detail || 'Review the required fields and retry.' :
      status === 403 ? 'Your account cannot save this change.' : 'The API could not confirm this change. Reload before retrying.';
    throw new ApiError(status, message);
  }
  return payload.data;
}
function safeUrl(value: string) {
  try { const address = new URL(value); return ['https:', 'http:'].includes(address.protocol) && !address.username && !address.password; }
  catch { return false; }
}
function validateFields(values: RecordData, fields: EditorFields) {
  const result: RecordData = {};
  for (const rule of fields) {
    const raw = values[rule.name];
    if (raw === undefined) {
      if (rule.required) throw invalid('Enter ' + rule.label.toLowerCase() + '.');
      continue;
    }
    if (typeof raw !== 'string') throw invalid('Invalid ' + rule.label.toLowerCase() + '.');
    const text = raw.trim();
    if (rule.required && !text) throw invalid('Enter ' + rule.label.toLowerCase() + '.');
    if (text.length > (rule.max ?? (rule.kind === 'lines' ? 16000 : 2000))) throw invalid(rule.label + ' is too long.');
    switch (rule.kind) {
      case 'boolean':
        if (!['true', 'false'].includes(text)) throw invalid('Choose a value for ' + rule.label.toLowerCase() + '.');
        result[rule.name] = text === 'true'; break;
      case 'number':
        if (!text) break;
        if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(text)) throw invalid(rule.label + ' must be a positive number or zero.');
        result[rule.name] = Number(text); break;
      case 'lines': {
        const lines = [...new Set(text.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
        if (lines.length > 60 || lines.some(line => line.length > 2000)) throw invalid(rule.label + ' has too many or oversized entries.');
        result[rule.name] = lines; break;
      }
      case 'choice':
        if (!rule.choices?.some(choice => choice.value === text)) throw invalid('Choose a value for ' + rule.label.toLowerCase() + '.');
        result[rule.name] = text; break;
      case 'url':
        if (text && !safeUrl(text)) throw invalid('Use an HTTP or HTTPS URL for ' + rule.label.toLowerCase() + '.');
        result[rule.name] = text; break;
      case 'json':
        if (!text) { result[rule.name] = []; break; }
        try { result[rule.name] = JSON.parse(text); } catch { throw invalid(rule.label + ' has invalid JSON.'); }
        break;
      default: result[rule.name] = text;
    }
  }
  return result;
}

export async function readProduct(id: string, auth: Session, region: Region) {
  if (!has(auth.staff, 'product.view')) throw new ApiError(403);
  if (!mongoId(id)) throw new ApiError(404);
  const record = obj(await api('/product/admin/products/' + id, auth.token));
  if (reference(record) !== id || (str(record.region) || 'BD') !== region) throw new ApiError(404);
  return record;
}

export async function readRegistry(kind: Registry, id: string, auth: Session, region: Region) {
  if (!has(auth.staff, routes[kind].view)) throw new ApiError(403);
  if (!mongoId(id)) throw new ApiError(404);
  const entry = obj(await api(registryRead[kind] + '/' + id, auth.token));
  if (reference(entry) !== id) throw new ApiError(404);
  if (kind === 'reviews' || kind === 'faqs') await scopedProduct(reference(entry.product), auth, region);
  return entry;
}

async function scopedProduct(id: string, auth: Session, region: Region) {
  if (!mongoId(id)) throw invalid('Choose a product.');
  const record = obj(await api('/product/admin/products/' + id, auth.token));
  if (reference(record) !== id || (str(record.region) || 'BD') !== region) throw new ApiError(404, 'Product not found in the selected market.');
  return record;
}

export async function writeRegistry(kind: Registry, action: string, id: string, values: RecordData, auth: Session, region: Region) {
  if (action === 'seed' && kind === 'countries') {
    if (!canEditRegistry(kind, 'create', auth) || !superAdmin(auth.staff)) throw new ApiError(403);
    return saved('/country/seed/defaults', auth, 'POST');
  }
  if (!['save', 'delete', 'status', 'reply'].includes(action) || (action === 'status' || action === 'reply') && kind !== 'reviews' && kind !== 'faqs') throw invalid('Unknown catalog action.');
  const grant = action === 'delete' ? 'delete' : id ? 'edit' : 'create';
  if (!canEditRegistry(kind, grant, auth) || (kind === 'reviews' || action !== 'save') && !id) throw new ApiError(403);
  if (id) await readRegistry(kind, id, auth, region);
  const path = routes[kind].base + (id ? '/' + id : '');
  if (action === 'delete') return saved(path, auth, 'DELETE');
  if (action === 'status') {
    if (kind === 'faqs') {
      if (!['active', 'inactive', 'pending'].includes(str(values.status))) throw invalid('Choose an FAQ status.');
      return saved('/faq/admin/public-faq-action/' + id, auth, 'PATCH', { status: values.status });
    }
    if (!['pending', 'approved', 'rejected'].includes(str(values.status))) throw invalid('Choose a review status.');
    return saved(path + '/status', auth, 'PATCH', { status: values.status });
  }
  if (action === 'reply') {
    const content = str(values.content).trim();
    if (!content || content.length > 2000) throw invalid('Enter a reply up to 2,000 characters.');
    if (kind === 'faqs') return saved('/faq/admin/public-faq-action/' + id, auth, 'PATCH', { status: 'active', answer: content });
    return saved(path + '/reply', auth, 'PATCH', { content });
  }
  const rules = registries[kind].fields.filter(field => kind !== 'faqs' || field.name !== 'product' || !id);
  const fields = validateFields(values, rules.map(field => kind === 'faqs' && id && field.name === 'answer' ? { ...field, required: false } : field));
  if (kind === 'countries') {
    const code = str(fields.code).toUpperCase();
    if (!/^[A-Z]{2,3}$/.test(code) || (fields.serial !== undefined && !Number.isInteger(fields.serial))) throw invalid('Enter a country code and a whole display order.');
    fields.code = code;
  }
  if (kind === 'policies' && !Number.isInteger(fields.return_period_days)) throw invalid('Return period must be a whole number of days.');
  if (kind === 'reviews') fields.rating = Number(fields.rating);
  if (kind === 'faqs' && !id) await scopedProduct(str(fields.product), auth, region);
  return saved(path, auth, id ? 'PATCH' : 'POST', fields);
}

const numbers = ['regular_price', 'sale_price', 'buying_price'] as const;
function variantPrice(input: RecordData, allowCost: boolean) {
  const output: RecordData = {};
  for (const field of numbers) {
    if (field === 'buying_price' && !allowCost || input[field] === undefined || input[field] === '') continue;
    if (typeof input[field] !== 'number' || !Number.isFinite(input[field]) || Number(input[field]) < 0) throw invalid('Prices must be non-negative numbers.');
    output[field] = input[field];
  }
  return output;
}

function cleanVariants(values: RecordData, auth: Session, requireRows: boolean) {
  const attributes = arr(values.attributes).map(str).map(value => value.trim());
  if (attributes.some(value => !value || value.length > 80 || /[.$]/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value))
    || attributes.length > 12 || new Set(attributes).size !== attributes.length) throw invalid('Choose up to 12 unique attribute names.');
  const rows = arr(values.variants).map(obj);
  if (rows.length > 120 || requireRows && !rows.length) throw invalid('Choose between 1 and 120 variant rows.');
  const allowCost = has(auth.staff, 'purchase.price.view');
  const seenSku = new Set<string>(), seenSignature = new Set<string>();
  const variants = rows.map(row => {
    const sku = str(row.sku).trim().toUpperCase();
    const selected = obj(row.attribute_values);
    const values = attributes.map(name => str(selected[name]).trim());
    if (!sku || sku.length > 100 || seenSku.has(sku)) throw invalid('Each variant requires a unique SKU.');
    if (!attributes.length || values.some(value => !value || value.length > 140)) throw invalid('Fill in every attribute value on each variant.');
    const signature = JSON.stringify(values);
    if (seenSignature.has(signature)) throw invalid('Each variant requires a unique combination of attributes.');
    seenSku.add(sku); seenSignature.add(signature);
    const base = variantPrice(row, allowCost);
    if (base.regular_price === undefined || base.sale_price === undefined) throw invalid('Enter the regular and sale price for every variant.');
    const pricing = obj(row.prices);
    const prices = Object.fromEntries(currencies.flatMap(currency => {
      const value = variantPrice(obj(pricing[currency]), allowCost);
      return Object.keys(value).length ? [[currency, value]] : [];
    }));
    const images = arr(row.images).map(str), videos = arr(row.videos).map(str);
    const image = str(row.image).trim(), colorImage = str(row.color_image).trim();
    const imageSource = str(row.image_based_on).trim();
    if ([...images, ...videos, image, colorImage].filter(Boolean).some(value => !safeUrl(value))) throw invalid('Use HTTP or HTTPS URLs for variant media.');
    return { ...(mongoId(str(row._id)) ? { _id: row._id } : {}), sku,
      attribute_values: Object.fromEntries(attributes.map((name, index) => [name, values[index]])),
      ...base, image, images, videos, color_image: colorImage, color_code: str(row.color_code).slice(0, 32), prices,
      ...(row.image_based_on !== undefined && { image_based_on: attributes.includes(imageSource) ? imageSource : '' }) };
  });
  return { attributes, variants };
}

function cleanProduct(values: RecordData, region: Region, previous: RecordData) {
  const fields = validateFields(values, productFields);
  const { facebook, instagram, youtube, tiktok, website, pos, short_videos, ...product } = fields;
  const category = str(values.category);
  if (!mongoId(category)) throw invalid('Choose a category.');
  if (!mongoId(str(values.subcategory))) throw invalid('Choose a subcategory.');
  const references = ['subcategory', 'sub_subcategory', 'third_subcategory', 'brand', 'return_policy'] as const;
  for (const key of references) if (values[key] && !mongoId(str(values[key]))) throw invalid('Choose a valid ' + key.replaceAll('_', ' ') + '.');
  const selected = { category, ...Object.fromEntries(references.map(key => [key, str(values[key]) || null])) };
  const countries = [...new Set(arr(values.available_countries).map(str))];
  if (countries.some(value => !mongoId(value)) || countries.length > 250) throw invalid('Choose existing countries.');
  const clips = arr(short_videos).map(str);
  if ([...clips, ...arr(product.slider_images).map(str)].some(value => !safeUrl(value))) throw invalid('Use HTTP or HTTPS links for product media.');
  const existingClips = arr(previous.short_videos).map(obj);
  const dynamic = arr(product.dynamic_specs).map(obj);
  if (product.dynamic_specs !== undefined && !Array.isArray(product.dynamic_specs) || dynamic.length > 30 || dynamic.some(spec => !str(spec.title).trim() || !Array.isArray(spec.options) && spec.options !== undefined)) {
    throw invalid('Specifications must be an array of title, description and options objects.');
  }
  product.dynamic_specs = dynamic.map(spec => ({ title: str(spec.title).slice(0, 200), description: str(spec.description).slice(0, 2000), options: arr(spec.options).map(str).slice(0, 30) }));
  const min = Number(product.min_order_qty ?? 1), max = Number(product.max_order_qty ?? 100);
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 1 || max < min) throw invalid('Enter valid minimum and maximum order quantities.');
  return { ...product, ...selected, region, available_countries: region === 'INTERNATIONAL' ? countries : [],
    social_links: { facebook, instagram, youtube, tiktok }, sale_channels: { website: website === true, pos: pos === true },
    short_videos: clips.map(clip => existingClips.find(record => record.url === clip) ?? { url: clip }) };
}

export async function productWrite(action: string, id: string, values: RecordData, auth: Session, region: Region) {
  const grant = action === 'delete' ? 'delete' : id ? 'edit' : 'create';
  if (!canEditProduct(grant, auth) || (!id && action !== 'save')) throw new ApiError(403);
  const previous = id ? await readProduct(id, auth, region) : {};
  if (action === 'delete') return saved('/product/' + id, auth, 'DELETE');
  if (action === 'variants') return saved('/product/variant/' + id, auth, 'PATCH', cleanVariants(values, auth, true));
  if (action === 'delete-variant') {
    if (!canEditProduct('delete', auth) || !mongoId(str(values.variant))) throw new ApiError(403);
    return saved('/product/variant/by-product/' + id, auth, 'DELETE', { variant_ids: [values.variant] });
  }
  if (action !== 'save') throw invalid('Unknown product action.');
  const fields = cleanProduct(values, region, previous);
  if (id) return saved('/product/' + id, auth, 'PATCH', fields);
  const { attributes, variants } = cleanVariants(values, auth, false);
  const createFields = Object.fromEntries(Object.entries(fields).filter(([,value]) => value !== null));
  return saved('/product', auth, 'POST', { ...createFields, attributes, variantsCombination: variants });
}

export async function catalogImage(request: Request, auth: Session) {
  if (!canEditProduct('create', auth) && !canEditProduct('edit', auth)) throw new ApiError(403);
  const type = request.headers.get('content-type') ?? '';
  const size = Number(request.headers.get('content-length'));
  if (!Number.isSafeInteger(size) || size < 1 || size > 8 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
    throw new ApiError(415, 'Choose a JPEG, PNG or WebP image up to 8 MB.');
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength !== size) throw invalid('The upload was incomplete.');
  const form = new FormData();
  form.append('files', new Blob([bytes], { type }), 'product-image');
  const result = await requestApi('/catalog/media/upload', auth.token, { method: 'POST', body: form });
  const payload = obj(await result.json().catch(() => null));
  const image = str(obj(arr(payload.data)[0]).url);
  if (!result.ok || payload.success !== true || !safeUrl(image)) throw new ApiError(result.ok ? 502 : result.status, 'Image upload is unavailable. You can use an HTTP or HTTPS image URL.');
  return image;
}

export async function registryOptions(path: string, key: string, auth: Session) {
  const result = await api(url(path, { limit: '250' }), auth.token);
  return arr(Array.isArray(result) ? result : obj(result)[key]).map(obj)
    .filter(row => mongoId(reference(row))).map(row => ({ value: reference(row), label: str(row.name) || str(row.title) || str(row.code), code: str(row.code) }));
}
