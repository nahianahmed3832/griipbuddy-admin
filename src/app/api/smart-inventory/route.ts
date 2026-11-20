import { ApiError, canWrite, getRegion, obj, requestApi, sameOrigin, session, str, url } from '@/lib/api';
import { barcodeConditions, barcodePattern, barcodeStatuses } from '@/lib/barcode-data';
import { canOperate } from '@/lib/operations';
import { has } from '@/lib/sections';
import { barcodeHistory, barcodeVariants, validateReceiptScan } from '@/lib/smart-inventory';

export async function GET(request: Request) {
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401 });
  const query = new URL(request.url).searchParams;
  const action = query.get('action');
  const value = (query.get('q') ?? '').trim();
  try {
    const region = getRegion(query.get('region') ?? undefined, auth.staff);
    if (action === 'variants' && canOperate(auth.staff, 'barcode-generate')) {
      return Response.json(await barcodeVariants(value, auth, region));
    }
    if (action === 'catalog-variants' && has(auth.staff, 'barcode.view') && has(auth.staff, 'product.view') && value.length >= 2) {
      return Response.json(await barcodeVariants(value, auth, region));
    }
    if (action === 'validate' && canOperate(auth.staff, 'barcode-receive')) {
      return Response.json(await validateReceiptScan(value, auth, region));
    }
    return new Response('Access restricted', { status: 403 });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return new Response(error.status >= 500 ? 'Smart Inventory could not reach the recovery API.' : error.message, { status: error.status });
  }
}

export async function PATCH(request: Request) {
  if (!sameOrigin(request)) return new Response('Origin denied.', { status: 403 });
  const auth = await session();
  if (!auth) return new Response('Sign in required.', { status: 401 });
  const query = new URL(request.url).searchParams;
  const action = query.get('action');
  if ((action !== 'edit' && action !== 'reset') || !canWrite(auth.staff) || !has(auth.staff, 'barcode.view') ||
      !has(auth.staff, action === 'reset' ? 'barcode.reset' : 'barcode.update')) {
    return new Response('Access restricted.', { status: 403 });
  }
  const code = query.get('code') ?? '';
  if (!barcodePattern.test(code)) return new Response('Enter a valid barcode.', { status: 400 });
  try {
    const region = getRegion(query.get('region') ?? undefined, auth.staff);
    const edit = action === 'edit';
    let payload = {};
    if (edit) {
      if (!request.headers.get('content-type')?.startsWith('application/json') || Number(request.headers.get('content-length')) > 2000) {
        return new Response('Invalid barcode update.', { status: 400 });
      }
      const raw = await request.text();
      if (Buffer.byteLength(raw) > 2000) return new Response('Barcode update is too large.', { status: 413 });
      let body;
      try { body = obj(JSON.parse(raw)); } catch { return new Response('Invalid barcode update.', { status: 400 }); }
      const status = str(body.status);
      const condition = str(body.condition);
      const note = str(body.note).trim();
      if (!barcodeStatuses.includes(status) || condition && !barcodeConditions.includes(condition) || note.length > 400) {
        return new Response('Check the status, condition, and note.', { status: 400 });
      }
      payload = { barcode: code, status, ...(condition && { conditions: condition }), ...(note && { admin_note: note }) };
    }
    await barcodeHistory(code, auth, region);
    const path = edit ? '/barcode/update-barcode' : '/barcode/' + encodeURIComponent(code) + '/barcode-reset';
    const response = await requestApi(url(path, { region }), auth.token, { method: 'PATCH', body: JSON.stringify(payload) });
    const result = obj(await response.json().catch(() => null));
    if (!response.ok || result.success !== true) {
      return new Response(response.status < 500 && str(result.message).slice(0, 280) || 'The barcode change was not confirmed.',
        { status: response.ok ? 502 : response.status });
    }
    return Response.json({ saved: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return new Response(error.status < 500 ? error.message : 'The barcode change was not confirmed.', { status: error.status });
  }
}
