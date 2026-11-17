import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { utils, write } from 'xlsx';
import { ApiError, obj, sameOrigin, session, str } from '@/lib/api';
import { changePosSale, loadPosRegisterPage, posRegisterFilters, posReturnDetails, readPosSale, searchPosCustomers, searchPosItems } from '@/lib/production-pos';
import { posColumns } from '@/lib/pos';
import { has } from '@/lib/sections';

const noStore = { 'Cache-Control': 'private, no-store' };
const failure = (error: unknown) => error instanceof ApiError
  ? new Response(error.status >= 500 ? 'The sales service did not confirm the request.' : error.message, { status: error.status })
  : new Response('Invalid sale request.', { status: 400 });

export async function GET(request: Request) {
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401 });
  const q = new URL(request.url).searchParams;
  const action = q.get('action');
  const search = q.get('q')?.trim() ?? '';
  try {
    if ((action === 'products' || action === 'scan') && search.length >= 2 && search.length <= 100) {
      return Response.json(await searchPosItems(q.get('location') || '', search, auth, action === 'scan'), { headers: noStore });
    }
    if (action === 'customers') return Response.json(await searchPosCustomers(search, auth), { headers: noStore });
    if (action === 'return' && has(auth.staff, 'pos.update')) {
      return Response.json(posReturnDetails(await readPosSale(q.get('id') || '', auth)), { headers: noStore });
    }
    if (action !== 'xlsx' && action !== 'pdf') return new Response('Unknown sale action.', { status: 404 });
    const filters = await posRegisterFilters(Object.fromEntries(q), auth);
    const columns = posColumns.filter(([key]) => (key !== 'cost' || filters.canSeeCost) && (key !== 'profit' || filters.canSeeProfit)
      && (!q.has('columns') || q.get('columns')!.split(',').includes(key)));
    if (!columns.length) return new Response('Choose at least one export field.', { status: 400 });
    const { rows, total } = await loadPosRegisterPage(auth, filters, 1, 250);
    if (total > 10000) return new Response('Choose a smaller date range to export up to 10,000 sales.', { status: 422 });
    for (let page = 2; page <= Math.ceil(total / 250); page++) rows.push(...(await loadPosRegisterPage(auth, filters, page, 250)).rows);
    const headers = columns.map(([, label]) => label);
    const records = rows.map(row => columns.map(([key]) => row.amounts[key] ?? row.cells[key] ?? ''));
    let bytes: ArrayBuffer;
    if (action === 'xlsx') {
      const workbook = utils.book_new();
      utils.book_append_sheet(workbook, utils.aoa_to_sheet([headers, ...records]), 'Sales Report');
      bytes = write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    } else {
      const pdf = new jsPDF({ orientation: 'landscape' });
      pdf.setFontSize(16);
      pdf.text('Sales Reports', 14, 16);
      autoTable(pdf, { startY: 23, head: [headers], body: records, styles: { fontSize: 7, overflow: 'linebreak' },
        headStyles: { fillColor: '#dcf0e8', textColor: '#101010' } });
      bytes = pdf.output('arraybuffer');
    }
    return new Response(bytes, { headers: { ...noStore, 'X-Content-Type-Options': 'nosniff',
      'Content-Type': action === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="sales-report.' + action + '"',
    } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Origin denied', { status: 403 });
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401 });
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 16384) {
    return new Response('Invalid sale request.', { status: 400 });
  }
  const body = await request.text();
  if (body.length > 16384) return new Response('Invalid sale request.', { status: 400 });
  try {
    const input = obj(JSON.parse(body));
    await changePosSale(str(input.id), input.action, obj(input.values), auth);
    return Response.json({ saved: true });
  } catch (error) { return failure(error); }
}
