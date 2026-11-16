import { NextRequest } from 'next/server';
import { api, ApiError, arr, mongoId, obj, session, str, url } from '@/lib/api';
import { has } from '@/lib/sections';

const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  try {
    const auth = await session();
    if (!auth) return new Response('Sign in required.', { status: 401, headers });
    if (!has(auth.staff, 'cms.view') || !has(auth.staff, 'product.view')) return new Response('Access denied.', { status: 403, headers });
    const search = request.nextUrl.searchParams.get('q')?.trim().slice(0, 100);
    if (!search || search.length < 2) return Response.json([], { headers });
    const result = obj(await api(url('/product/admin/all', {
      region:'BD', searchQuery:search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), page:'1', limit:'20',
    }), auth.token));
    return Response.json(arr(result.data).map(obj).map(row => ({ id:str(row._id), name:str(row.name) || str(row.sku) }))
      .filter(row => mongoId(row.id) && row.name), { headers });
  } catch (error) {
    return new Response('Products are unavailable.', { status: error instanceof ApiError ? error.status : 503, headers });
  }
}
