import { NextRequest } from 'next/server';
import { ApiError, getRegion, requestApi, session, url } from '@/lib/api';
import { reportIds, reportQuery } from '@/lib/data';

export async function GET(req: NextRequest) {
  const auth = await session();
  if (!auth) return new Response('Sign in to export reports', { status: 401 });
  const query = Object.fromEntries(req.nextUrl.searchParams);
  if (!reportIds.includes(query.id) || !['csv','xlsx'].includes(query.format)) return new Response('Unknown report', { status: 404 });
  try {
    const scope = reportQuery(query, getRegion(query.region, auth.staff));
    const response = await requestApi(url('/analytics/reports/' + query.id + '/export', { ...scope, format: query.format }), auth.token);
    if (!response.ok) return new Response('Export is unavailable for this account or report', { status: response.status });
    const mime = query.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return new Response(response.body, { headers: { 'Content-Type': mime, 'Content-Disposition': 'attachment; filename="' + query.id + '.' + query.format + '"', 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return new Response('Report export unavailable', { status: error instanceof ApiError ? error.status : 503 });
  }
}
