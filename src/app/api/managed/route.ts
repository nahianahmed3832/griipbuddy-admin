import { ApiError, canWrite, mongoId, obj, requestApi, sameOrigin, session, str } from '@/lib/api';
import { canManage, managedAction, uploadAsset, uploadSupplier, writeManaged } from '@/lib/managed';
import { has } from '@/lib/sections';

export async function GET(request: Request) {
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401 });
  if (!canManage(auth.staff) || !has(auth.staff,'order.view')) return new Response('Operator access required', { status: 403 });
  const id = new URL(request.url).searchParams.get('receipt') ?? '';
  if (!mongoId(id)) return new Response('Receipt not found', { status: 404 });
  try {
    const upstream = await requestApi('/global/admin/payments/' + id + '/receipt', auth.token);
    if (!upstream.ok || upstream.headers.get('content-type') !== 'image/jpeg') {
      return new Response('Receipt unavailable', { status: upstream.ok ? 502 : upstream.status });
    }
    return new Response(upstream.body, { headers: { 'Content-Type':'image/jpeg', 'Content-Disposition':'attachment; filename="receipt.jpg"',
      'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff' } });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return new Response('Receipt unavailable', { status: error.status });
  }
}

async function boundedBody(request: Request, limit: number) {
  if (Number(request.headers.get('content-length')) > limit) throw new ApiError(413, 'The request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'A request body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new ApiError(413, 'The request is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Origin denied', { status: 403 });
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401 });
  if (!canManage(auth.staff) || !canWrite(auth.staff)) return new Response('Operator access required', { status: 403 });
  const type = request.headers.get('content-type') ?? '';
  try {
    if (type.startsWith('multipart/form-data;')) {
      const asset = new URL(request.url).searchParams.get('asset') === '1';
      const limit = (asset ? 8 : 4) * 1024 * 1024;
      const data = await boundedBody(request, limit + 8192);
      const incoming = await new Response(new Uint8Array(data), { headers: { 'Content-Type': type } }).formData();
      const file = incoming.get('file');
      if (asset) {
        if (!(file instanceof File) || !file.size || file.size > limit || !['image/jpeg','image/png','image/webp'].includes(file.type)) {
          throw new ApiError(400, 'Choose a JPEG, PNG or WebP image up to 8 MiB.');
        }
        return Response.json({ id: await uploadAsset(file, auth) });
      }
      if (!(file instanceof File) || !file.size || file.size > limit || !/\.(csv|xlsx)$/i.test(file.name)
        || incoming.get('confirmedApproved') !== 'true') {
        throw new ApiError(400, 'Confirm supplier approval and choose a CSV or XLSX file up to 4 MiB.');
      }
      const form = new FormData();
      form.set('file', file);
      form.set('confirmedApproved', 'true');
      form.set('createDrafts', incoming.get('createDrafts') === 'true' ? 'true' : 'false');
      form.set('ingestMedia', 'false');
      const result = await uploadSupplier(str(incoming.get('supplier')), form, str(incoming.get('key')), auth);
      return Response.json({ id: obj(result)._id });
    }
    if (!type.startsWith('application/json')) throw new ApiError(415, 'Choose a supported request format.');
    const { action, market, id, step, values, key } = obj(JSON.parse((await boundedBody(request, 64_000)).toString('utf8')));
    if (typeof action !== 'string' || !managedAction(action)) throw new ApiError(400, 'Choose a valid operation.');
    const result = await writeManaged(action, str(market), str(id), str(step), obj(values), auth, str(key));
    return Response.json({ id: obj(result)._id });
  } catch (error) {
    if (error instanceof ApiError) return new Response(error.message, { status: error.status });
    if (error instanceof SyntaxError || error instanceof TypeError) return new Response('Invalid request', { status: 400 });
    throw error;
  }
}
