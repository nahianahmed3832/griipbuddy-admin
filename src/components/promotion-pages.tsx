import Link from 'next/link';
import { api, ApiError, arr, canWrite, mongoId, obj, str, url, type Session } from '@/lib/api';
import { couponAmounts, couponScopes } from '@/lib/promotion-fields';
import { has, type Region } from '@/lib/sections';
import { PageHeading } from './dashboard';
import { CouponForm, OfferForm } from './promotion-forms';
import { OperationActions } from './operation-actions';

type Fields = Record<string, string | boolean>;
const reference = (value: unknown) => str(obj(value)._id) || str(value);
function minute(value: unknown, hours = 0) {
  const date = Date.parse(str(value));
  return Number.isFinite(date) ? new Date(date + hours * 3600000).toISOString().slice(0, 16) : '';
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

export async function GlobalOffer({ auth, region }: { auth: Session; region: Region }) {
  if (region !== 'BD' || !has(auth.staff, 'cms.view')) throw new ApiError(403);
  const [offer, source] = await Promise.all([
    api('/cms/offer-page', auth.token).then(obj),
    api('/sub-category?page=1&limit=300', auth.token),
  ]);
  const items = Array.isArray(source) ? source : arr(obj(source).subcategories);
  const selected = arr(offer.applied_subcategories).map(reference).filter(mongoId);
  const options = new Map();
  for (const item of [...items, ...arr(offer.applied_subcategories)]) {
    const id = reference(item);
    const raw = obj(item);
    const label = str(raw.name) || str(raw.name_en) || str(raw.slug) || id;
    if (mongoId(id) && !options.has(id)) options.set(id, { id, label });
  }
  const config = obj(offer.pageConf);
  const timer = obj(config.timer_config);
  const fields: Fields = {
    offer_start_date: minute(offer.offer_start_date, 6), validFor: String(offer.validFor ?? 1), discountPercentage: String(offer.discountPercentage ?? 0),
    navbar_label: str(offer.navbar_label), freeDelivery: offer.freeDelivery === true, specialSaleActive: offer.specialSaleActive === true,
    title: str(config.title), show_timer: timer.show_timer !== false, mode: str(timer.mode) || 'countdown',
    ...Object.fromEntries(Object.entries(obj(config.header)).map(([key,value]) => ['header.' + key, str(value)])),
  };
  return <>
    <PageHeading eyebrow="STOREFRONT / CONTENT" title="Global offer" description="Manage the Bangladesh offer page, headline, timer and eligible subcategories.">
      <Link className="button secondary" prefetch={false} href={'/desk/content/offer?refresh=' + Date.now()}>Refresh</Link>
    </PageHeading>
    <OfferForm initial={fields} options={[...options.values()]} selected={selected} writable={canWrite(auth.staff) && has(auth.staff, 'cms.create')}/>
  </>;
}
