import Link from 'next/link';
import { api, ApiError, arr, canWrite, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { loadCategoryTree } from '@/lib/catalog-list';
import { loadResource, param, type Query } from '@/lib/data';
import { couponAmounts, couponPageSizes, couponScopes } from '@/lib/promotion-fields';
import { has, resources, type Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { CouponForm, OfferForm, ProductionOfferForm, type OfferOption } from './promotion-forms';
import { OperationActions } from './operation-actions';
import { ProductionCouponCreate, ProductionCouponDetail, ProductionCouponList, type CouponSummary } from './production-coupons';

type Fields = Record<string, string | boolean>;
const reference = (value: unknown) => str(obj(value)._id) || str(value);
function minute(value: unknown, hours = 0) {
  const date = Date.parse(str(value));
  return Number.isFinite(date) ? new Date(date + hours * 3600000).toISOString().slice(0, 16) : '';
}

function summary(row: RecordData): CouponSummary {
  return { id: reference(row), code: str(row.code), type: str(row.discountType), discount: String(row.discountValue ?? 0),
    used: Number(row.usedCount) || 0, active: row.isActive === true, expires: str(row.expireAt) };
}

export async function ProductionCouponWorkspace({ auth, region, id, q }: { auth: Session; region: Region; id?: string; q: Query }) {
  if (!has(auth.staff, 'coupon.view')) throw new ApiError(403);
  const writable = canWrite(auth.staff);
  const canCreate = writable && has(auth.staff, 'coupon.create');
  if (id === 'new') {
    if (!canCreate) throw new ApiError(403);
    const tree = has(auth.staff, 'product.view') ? await loadCategoryTree(auth) : [];
    const now = Date.now();
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: region === 'BD' ? 'Asia/Dhaka' : 'UTC' });
    return <ProductionCouponCreate region={region} tree={tree} starts={day.format(now)} expires={day.format(now + 7 * 86400000)}/>;
  }
  if (id) {
    if (!mongoId(id)) throw new ApiError(404);
    const row = obj(await api('/coupon/' + id, auth.token));
    if (reference(row) !== id) throw new ApiError(404);
    const amounts = ['Min Order Amount', 'Max Discount', 'Usage Limit', 'Per User Limit'];
    const detail: [string, string][] = ['minOrderAmount', 'maxDiscountAmount', 'usageLimit', 'usagePerUser']
      .map((key, index) => [amounts[index], row[key] == null || row[key] === 0 ? '—' : String(row[key])]);
    detail.push(['First Order Only', row.firstOrderOnly === true ? 'Yes' : 'No']);
    const targeting = ['Categories','Sub Categories','Sub-Sub Categories','Specific Products','Variants'];
    return <ProductionCouponDetail region={region} coupon={{ ...summary(row), description: str(row.description), starts: str(row.startAt), created: str(row.createdAt), details: detail,
      targeting: couponScopes.slice(0, 5).map(([key], index) => [targeting[index], arr(row[key]).map(item => str(obj(item).name) || str(obj(item).name_en) || str(obj(item).sku) || reference(item)).filter(Boolean)]) }}/>;
  }
  const requested = param(q, 'limit') ?? '';
  const limit = couponPageSizes.includes(requested) ? requested : '20';
  const all = limit === 'all';
  const list = await loadResource(resources.marketing.coupons, auth, all ? { page: '1' } : q, region, all ? 10000 : Number(limit));
  return <ProductionCouponList rows={list.rows.map(summary).filter(row => mongoId(row.id))} region={region} limit={limit} total={list.total ?? list.rows.length}
    page={list.page} hasNext={!all && list.hasNext} canCreate={canCreate} canEdit={writable && has(auth.staff, 'coupon.update')} canDelete={writable && has(auth.staff, 'coupon.delete')}/>;
}
export async function CouponEditor({ auth, region, id }: { auth: Session; region: Region; id?: string }) {
  const allowed = canWrite(auth.staff);
  if (!has(auth.staff, 'coupon.view') || (!id && (!allowed || !has(auth.staff, 'coupon.create')))) throw new ApiError(403);
  if (id && !mongoId(id)) throw new ApiError(404);
  const record = id ? obj(await api('/coupon/' + id, auth.token)) : {};
  if (id && !mongoId(reference(record))) throw new ApiError(404);
  const fields: Fields = { ...Object.fromEntries(['code', 'description', 'discountType'].map(key => [key, str(record[key])])),
    ...Object.fromEntries(couponAmounts.map(([key]) => [key, typeof record[key] === 'number' ? String(record[key]) : ''])),
    ...Object.fromEntries(couponScopes.map(([key]) => [key, arr(record[key]).map(reference).filter(Boolean).join(', ')])),
    firstOrderOnly: record.firstOrderOnly === true, startAt: minute(record.startAt), expireAt: minute(record.expireAt) };
  if (!id) fields.discountType = 'PERCENTAGE';
  const back = url('/desk/marketing/coupons', { region });
  return <>
    <PageHeading eyebrow="MARKETING / COUPONS" title={id ? 'Coupon ' + str(record.code) : 'Create coupon'} description={id
      ? (record.isActive === true ? 'Enabled' : 'Disabled') + ' · ' + (record.usedCount ?? 0) + ' recorded uses'
      : 'Set the discount, eligibility and usage limits. New coupons start disabled.'}>
      <Link className="button secondary" href={back}>All coupons</Link>
      {id && <OperationActions endpoint="/coupon/admin/all" auth={auth} region={region} record={record} id={id}/>}
    </PageHeading>
    <CouponForm initial={fields} id={id} writable={allowed && has(auth.staff, id ? 'coupon.update' : 'coupon.create')} canDelete={allowed && has(auth.staff, 'coupon.delete')} back={back}/>
  </>;
}

export async function GlobalOffer({ auth, region, production = false }: { auth: Session; region: Region; production?: boolean }) {
  if (region !== 'BD' || !has(auth.staff, 'cms.view')) throw new ApiError(403);
  const [offer, source] = await Promise.all([
    api('/cms/offer-page', auth.token).then(obj),
    api('/sub-category?page=1&limit=300', auth.token),
  ]);
  const items = Array.isArray(source) ? source : arr(obj(source).subcategories);
  const selected = arr(offer.applied_subcategories).map(reference).filter(mongoId);
  const options = new Map<string, OfferOption>();
  for (const item of [...items, ...arr(offer.applied_subcategories)]) {
    const id = reference(item);
    const raw = obj(item);
    const label = str(raw.name) || str(raw.name_en) || str(raw.slug) || id;
    const category = obj(raw.category);
    const group = str(category.name_en) || str(category.slug);
    if (mongoId(id) && !options.has(id)) options.set(id, { id, label, group, slug: str(raw.slug) });
  }
  const config = obj(offer.pageConf);
  const timer = obj(config.timer_config);
  const fields: Fields = {
    offer_start_date: minute(offer.offer_start_date, 6), validFor: String(offer.validFor ?? 1), discountPercentage: String(offer.discountPercentage ?? 0),
    navbar_label: str(offer.navbar_label), freeDelivery: offer.freeDelivery === true, specialSaleActive: offer.specialSaleActive === true,
    title: str(config.title), show_timer: timer.show_timer !== false, mode: str(timer.mode) || 'countdown',
    ...Object.fromEntries(Object.entries(obj(config.header)).map(([key,value]) => ['header.' + key, str(value)])),
  };
  const writable = canWrite(auth.staff) && has(auth.staff, 'cms.create');
  if (production) return <ProductionOfferForm initial={{ ...fields, offer_start_date: minute(offer.offer_start_date).slice(0, 10) }}
    options={[...options.values()]} selected={selected} writable={writable}/>;
  return <>
    <PageHeading eyebrow="STOREFRONT / CONTENT" title="Global offer" description="Manage the Bangladesh offer page, headline, timer and eligible subcategories.">
      <Link className="button secondary" prefetch={false} href={'/desk/content/offer?refresh=' + Date.now()}>Refresh</Link>
    </PageHeading>
    <OfferForm initial={fields} options={[...options.values()]} selected={selected} writable={writable}/>
  </>;
}
