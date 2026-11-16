import { NextRequest } from 'next/server';
import { ApiError, getRegion, requestApi, session, url } from '@/lib/api';
import { has } from '@/lib/sections';
import { stockEndpoint, stockFilters } from '@/lib/stock-report';

export async function GET(req: NextRequest) {
  const auth = await session();
  if (!auth) return new Response('Sign in to export stock.', { status: 401 });
  if (!has(auth.staff, 'stock.view')) return new Response('Access denied.', { status: 403 });
  const q = Object.fromEntries(req.nextUrl.searchParams);
  try {
    const region = getRegion(q.region, auth.staff);
    const response = await requestApi(url(stockEndpoint, { ...stockFilters(q, region), format: 'xlsx' }), auth.token);
    if (!response.ok) return new Response(response.status === 413 ? 'Narrow the filters to 5,000 stock rows or fewer.' : 'Stock export could not be loaded.', { status: response.status });
    return new Response(response.body, { headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="stock-report.xlsx"', 'Cache-Control': 'private, no-store',
    } });
  } catch (error) {
    return new Response('Stock export is unavailable.', { status: error instanceof ApiError ? error.status : 503 });
  }
}
