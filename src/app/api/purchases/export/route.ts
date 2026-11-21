import type { NextRequest } from 'next/server';
import { ApiError, getRegion, operationsEnabled, session } from '@/lib/api';
import { serializeCsv } from '@/lib/csv';
import { opsApi } from '@/lib/operations-desk';
import type { PurchaseList } from '@/lib/purchasing';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  if (!operationsEnabled()) return new Response(null, { status: 404, headers: noStore });
  const auth = await session();
  if (!auth) return new Response(null, { status: 401, headers: noStore });
  const query = request.nextUrl.searchParams;
  try {
    const region = getRegion(query.get('region') ?? undefined, auth.staff);
    const { orders, page } = await opsApi<PurchaseList>(auth, region, 'purchases', {
      q: query.get('q')?.trim().slice(0, 80),
      page: query.get('page') ?? undefined,
    });
    const csv = serializeCsv([
      ['Reference', 'Region', 'Supplier', 'Warehouse', 'State', 'Units expected', 'Expected delivery'],
      ...orders.map(row => [row.reference, region, row.supplier, row.warehouse, row.state, String(row.expected), row.expectedAt ?? '']),
    ]);
    return new Response(csv, { headers: {
      ...noStore,
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="purchases-' + region.toLowerCase() + '-page-' + page + '.csv"',
    } });
  } catch (error) {
    if (error instanceof ApiError) return new Response(null, { status: error.status, headers: noStore });
    throw error;
  }
}
