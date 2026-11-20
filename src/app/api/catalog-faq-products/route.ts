import { type NextRequest } from 'next/server';
import { api, ApiError, arr, getRegion, mongoId, obj, session, str, url } from '@/lib/api';
import { canEditRegistry } from '@/lib/catalog-admin';
import { has } from '@/lib/sections';

const result = (payload: unknown, status = 200) => Response.json(payload, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: NextRequest) {
  const auth = await session();
  if (!auth) return result({ error: 'Sign in to search products.' }, 401);
  if (!canEditRegistry('faqs', 'create', auth) || !has(auth.staff, 'product.view')) return result({ error: 'Access restricted.' }, 403);
  try {
    const region = getRegion(request.nextUrl.searchParams.get('region') ?? undefined, auth.staff);
    const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 80);
    if (!q) return result([]);
    const data = obj(await api(url('/product/admin/all', { region, searchQuery: q.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&'), limit: '20' }), auth.token));
    return result(arr(data.data).map(obj).filter(row => mongoId(str(row._id)) && (str(row.region) || 'BD') === region).map(row => ({
      id: str(row._id), product: { name: str(row.name), sku: str(row.sku), slug: str(row.slug), image: str(row.thumbnail) },
    })));
  } catch (error) {
    return result({ error: 'Product search could not be loaded.' }, error instanceof ApiError ? error.status : 502);
  }
}
