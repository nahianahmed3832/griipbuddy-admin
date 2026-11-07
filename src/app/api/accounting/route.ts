import { ApiError, mongoId, obj, requestApi, sameOrigin, session, str, url } from '@/lib/api';
import { financeRead, financeWrite } from '@/lib/accounting';

const maxBody = 24_576;

function endpoint(operation: string, query: URLSearchParams) {
  const id = query.get('id') ?? '';
  const kind = query.get('kind') ?? '';
  if (operation === 'draft') return '/accounting/journals';
  if (operation === 'book') return '/accounting/books';
  if (operation === 'source' && mongoId(id) && /^(expense|order|pos|refund)$/.test(kind)) {
    return '/accounting/sources/' + kind + '/' + id;
  }
  if ((operation === 'review' || operation === 'reverse') && mongoId(id)) return '/accounting/journals/' + id + '/' + operation;
  if (operation === 'close' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(id)) return '/accounting/books/' + id + '/close';
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !financeWrite()) return new Response('Accounting writes are unavailable here.', { status: 403 });
  const auth = await session();
  if (!auth) return new Response('Sign in required.', { status: 401 });
  const query = new URL(request.url).searchParams;
  const path = endpoint(query.get('operation') ?? '', query);
  if (!path || !request.headers.get('content-type')?.startsWith('application/json') ||
      Number(request.headers.get('content-length')) > maxBody) return new Response('Invalid accounting request.', { status: 400 });
  const body = await request.text();
  if (Buffer.byteLength(body) > maxBody) return new Response('Accounting request is too large.', { status: 413 });
  try {
    const response = await requestApi(path, auth.token, { method: 'POST', body });
    const result = obj(await response.json().catch(() => null));
    if (!response.ok || result.success !== true) {
      const validation = Array.isArray(result.errorMessages) ? obj(result.errorMessages[0]) : {};
      const message = response.status < 500 ? str(result.message === 'Validation Error' ? validation.message : result.message) : '';
      return new Response(message.slice(0, 250) || 'The ledger could not confirm the action. Check the journal before retrying.',
        { status: response.ok ? 502 : response.status });
    }
    return Response.json(result.data, { status: response.status });
  } catch (error) {
    return new Response('The ledger could not confirm the action. Check the journal before retrying.',
      { status: error instanceof ApiError ? error.status : 503 });
  }
}

export async function GET(request: Request) {
  const auth = await session();
  if (!auth || !financeRead(auth.staff)) return new Response('Accounting permission required.', { status: auth ? 403 : 401 });
  const query = new URL(request.url).searchParams;
  const type = query.get('type');
  if (type !== 'report' && type !== 'journal') return new Response('Unknown accounting export.', { status: 400 });
  const scope = Object.fromEntries(['region', 'book', 'market', 'from', 'to'].map(key => [key, query.get(key) ?? undefined]));
  try {
    const response = await requestApi(url('/accounting/exports/' + type, scope), auth.token);
    if (!response.ok) {
      const data = obj(await response.json().catch(() => null));
      return new Response(response.status < 500 ? str(data.message) || 'Export unavailable.' : 'Export unavailable.',
        { status: response.status });
    }
    return new Response(response.body, { headers: {
      'Cache-Control': 'private, no-store', 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': response.headers.get('content-disposition') ?? 'attachment',
      'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) {
    return new Response('Export unavailable.', { status: error instanceof ApiError ? error.status : 503 });
  }
}
