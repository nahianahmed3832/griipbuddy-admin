import { api, ApiError, arr, canWrite, getRegion, mongoId, obj, publicSandbox, requestApi, sameOrigin, session, str, url } from '@/lib/api';
import { readProduct } from '@/lib/catalog-admin';
import { couponPayload, offerPayload } from '@/lib/promotion-settings';
import { has } from '@/lib/sections';

export async function GET(req: Request) {
  const auth = await session();
  if (!auth) return Response.json({ message: 'Sign in required.' }, { status: 401 });
  if (!['coupon.view', 'coupon.create', 'product.view'].every(key => has(auth.staff, key)) || !canWrite(auth.staff)) {
    return Response.json({ message: 'Access denied.' }, { status: 403 });
  }
  const params = new URL(req.url).searchParams;
  const region = getRegion(params.get('region') ?? undefined, auth.staff);
  try {
    const product = params.get('product');
    if (product) await readProduct(product, auth, region);
    const raw = (params.get('q') ?? '').trim().slice(0, 80);
    const searchQuery = raw.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&');
    const results = product ? await api('/product/variant/' + product, auth.token)
      : await api(url('/product/admin/all', { region, searchQuery, limit: '20', fields: 'name,sku,region' }), auth.token);
    const rows = arr(Array.isArray(results) ? results : obj(results).data).map(obj);
    return Response.json(rows.flatMap(row => {
      const id = str(row._id);
      if (!mongoId(id) || (!product && (str(row.region) || 'BD') !== region)) return [];
      const sku = str(row.sku);
      const name = product ? Object.values(obj(row.attribute_values)).map(str).filter(Boolean).join(' - ') : str(row.name);
      return [{ id, label: [name, sku].filter(Boolean).join(' · ') || id }];
    }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return Response.json({ message: 'Product options could not be loaded.' }, { status: error instanceof ApiError ? error.status : 502 });
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req) || publicSandbox()) return Response.json({ message: 'Access denied.' }, { status: 403 });
  const auth = await session();
  if (!auth) return Response.json({ message: 'Sign in required.' }, { status: 401 });
  if (!canWrite(auth.staff)) return Response.json({ message: 'This workspace does not allow these changes.' }, { status: 403 });
  if (!req.headers.get('content-type')?.startsWith('application/json') || Number(req.headers.get('content-length')) > 32000) {
    return Response.json({ message: 'Invalid request.' }, { status: 400 });
  }
  try {
    const raw = await req.text();
    if (raw.length > 32000) throw new ApiError(400, 'Invalid request.');
    const input = obj(JSON.parse(raw));
    const id = str(input.id);
    const action = str(input.action);
    let path: string, method: string, body: unknown, grants: string[];
    if (action === 'save-coupon' || action === 'create-coupon') {
      if (id && action === 'create-coupon') throw new ApiError(400, 'This action only creates coupons.');
      if (id && !mongoId(id)) throw new ApiError(400, 'Invalid coupon reference.');
      path = id ? '/coupon/' + id : '/coupon';
      method = id ? 'PATCH' : 'POST';
      grants = ['coupon.view', id ? 'coupon.update' : 'coupon.create'];
      const payload = obj(input.values);
      const values = couponPayload(payload);
      body = id ? values : Object.fromEntries(Object.entries({ ...values,
        isActive: action === 'create-coupon' && payload.isActive === true, createdBy: auth.staff.id }).filter(([,value]) => value !== null));
    } else if (action === 'set-coupon-status') {
      const { isActive } = obj(input.values);
      if (!mongoId(id) || typeof isActive !== 'boolean') throw new ApiError(400, 'Invalid coupon status.');
      path = '/coupon/toggle-status/' + id; method = 'PATCH'; grants = ['coupon.view', 'coupon.update'];
      body = { isActive };
    } else if (action === 'delete-coupon' || action === 'delete-announcement') {
      if (!mongoId(id)) throw new ApiError(400, 'Invalid record reference.');
      const coupon = action === 'delete-coupon';
      path = (coupon ? '/coupon/' : '/cms/admin/top-bar-messages/') + id;
      method = 'DELETE';
      grants = coupon ? ['coupon.view', 'coupon.delete'] : ['cms.view', 'cms.delete'];
    } else if (action === 'save-offer') {
      path = '/cms/offer-page'; method = 'PUT'; grants = ['cms.view', 'cms.create'];
      body = offerPayload(obj(input.values));
    } else throw new ApiError(400, 'Unknown action.');
    if (grants.some(key => !has(auth.staff, key))) throw new ApiError(403, 'You do not have access to this action.');
    const res = await requestApi(path, auth.token, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) throw new ApiError(res.status, res.status === 409 ? 'That code already exists or the record changed.' : 'The API rejected the change. Review the fields and try again.');
    return Response.json({ saved: true });
  } catch (error) {
    const status = error instanceof ApiError ? error.status : error instanceof SyntaxError ? 400 : 503;
    return Response.json({ message: error instanceof ApiError && status < 500 ? error.message : 'The API did not confirm the change.' }, { status });
  }
}
