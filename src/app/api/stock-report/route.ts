import { NextRequest } from 'next/server';
import { ApiError, getRegion, requestApi, session, url } from '@/lib/api';
import { has } from '@/lib/sections';
import { stockEndpoint, stockFilters } from '@/lib/stock-report';
import { loadProductionStock } from '@/lib/production-stock';
import { stockExcel, stockPdf } from '@/lib/production-stock-export';

export async function GET(req: NextRequest) {
  const auth = await session();
  if (!auth) return new Response('Sign in to export stock.', { status: 401 });
  if (!has(auth.staff, 'stock.view')) return new Response('Access denied.', { status: 403 });
  const q = Object.fromEntries(req.nextUrl.searchParams);
  try {
    const region = getRegion(q.region, auth.staff);
    if (['production-xlsx', 'production-pdf', 'production-summary-pdf'].includes(q.format)) {
      const { rows, total, summary, permissions, selected, locations, filters } = await loadProductionStock(auth, region, q, true);
      if (!rows.length || !summary) return new Response('No stock data available to download.', { status: 404 });
      if (total > rows.length && q.format !== 'production-summary-pdf') {
        return new Response('Narrow the filters to 10,000 stock rows or fewer.', { status: 413 });
      }
      const date = new Date();
      const timeZone = region === 'BD' ? 'Asia/Dhaka' : 'UTC';
      const generatedAt = date.toLocaleString('en-US', { timeZone });
      const stamp = date.toLocaleDateString('en-US', { timeZone }).replaceAll('/', '-');
      const params = {
        rows, summary, permission: permissions, generatedAt,
        locations: selected.length ? locations.filter(location => selected.includes(location.value)).map(location => location.label).join(', ') : 'All',
        skuQuery: filters.skuQuery, searchQuery: filters.searchQuery,
      };
      const xlsx = q.format === 'production-xlsx';
      const summaryPdf = q.format === 'production-summary-pdf';
      const data = xlsx ? stockExcel(params) : stockPdf(params, summaryPdf);
      const name = `stocks_${summaryPdf ? 'summary_' : ''}report_${stamp}.${xlsx ? 'xlsx' : 'pdf'}`;
      return new Response(data, { headers: {
        'Content-Type': xlsx ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf',
        'Content-Disposition': 'attachment; filename="' + name + '"', 'Cache-Control': 'private, no-store',
      } });
    }
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
