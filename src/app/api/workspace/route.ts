import { ApiError, getRegion, obj, requestApi, sameOrigin, session, str } from '@/lib/api';
import { bulkHandover, requireWrite, saveSale } from '@/lib/advanced';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Origin denied', { status: 403 });
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401 });
  if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 65_536) {
    return new Response('Invalid payload', { status: 400 });
  }
  const raw = await request.text();
  if (raw.length > 65_536) return new Response('Invalid payload', { status: 400 });
  try {
    const body = obj(JSON.parse(raw));
    if (body.action === 'pos' || body.action === 'pos-quote') return Response.json(await saveSale(obj(body.values), auth, body.action === 'pos-quote'));
    if (body.action === 'handover') {
      const region = str(body.region);
      if (!['BD','INTERNATIONAL'].includes(region)) return new Response('Invalid region', { status: 400 });
      return Response.json(await bulkHandover(obj(body.values), auth, getRegion(region, auth.staff)));
    }
    if (body.action === 'content') {
      requireWrite(auth, 'cms.view', 'cms.update');
      const result = await requestApi('/cms/admin/workspace', auth.token, { method: 'PATCH', body: JSON.stringify(body.values) });
      if (!result.ok) return new Response(result.status === 409 ? 'Content changed. Reload and review before saving.'
        : 'Check the content fields and try again.', { status: result.status });
      return Response.json({ saved: true });
    }
    return new Response('Unknown action', { status: 400 });
  } catch (error) {
    if (error instanceof SyntaxError) return new Response('Invalid payload', { status: 400 });
    if (!(error instanceof ApiError)) throw error;
    return new Response(error.status >= 500 ? 'The recovery API did not confirm the change.' : error.message, { status: error.status });
  }
}
