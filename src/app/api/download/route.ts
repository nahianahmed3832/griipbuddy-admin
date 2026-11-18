import { NextRequest } from 'next/server';
import { api, ApiError, getRegion, obj, requestApi, session, url } from '@/lib/api';
import { reportIds, reportQuery } from '@/lib/data';
import { hybridReportLocations } from '@/lib/hybrid-orders';
import { canMergeHybridReport, reportWithHybrid } from '@/lib/hybrid-delivery-reports';
import { hybridReportDownload } from '@/lib/hybrid-report-export';

export async function GET(req: NextRequest) {
  const auth = await session();
  if (!auth) return new Response('Sign in to export reports', { status: 401 });
  const query = Object.fromEntries(req.nextUrl.searchParams);
  if (!reportIds.includes(query.id) || !['csv','xlsx'].includes(query.format)) return new Response('Unknown report', { status: 404 });
  try {
    const region = getRegion(query.region, auth.staff);
    const scope = reportQuery(query, region);
    if (canMergeHybridReport(query.id, auth, region)) {
      scope.locations = hybridReportLocations(auth, scope.locations);
      const native = obj(await api(url('/analytics/reports/' + query.id, { ...scope, hybridMerge: '1',
        ...(query.id === 'data-health' && { hybridExport: '1' }), ...(query.order === 'desc' && { order: 'desc' }) }), auth.token));
      const combined = await reportWithHybrid(query.id, native, auth, region, scope.locations, true);
      if (combined !== native) return hybridReportDownload(query.id, combined, query.format as 'csv' | 'xlsx');
    }
    const response = await requestApi(url('/analytics/reports/' + query.id + '/export', { ...scope, ...(query.order === 'desc' && {order:'desc'}), format: query.format }), auth.token);
    if (!response.ok) return new Response('Export is unavailable for this account or report', { status: response.status });
    const mime = query.format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const originalName = /^attachment;\s*filename="([a-zA-Z0-9_-]{1,150}\.(?:csv|xlsx))"$/.exec(response.headers.get('content-disposition') ?? '')?.[1];
    const filename = originalName?.endsWith('.' + query.format) ? originalName : query.id + '.' + query.format;
    return new Response(response.body, { headers: { 'Content-Type': mime, 'Content-Disposition': 'attachment; filename="' + filename + '"', 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    return new Response('Report export unavailable', { status: error instanceof ApiError ? error.status : 503 });
  }
}
