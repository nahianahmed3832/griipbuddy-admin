import { ApiError, canWrite, mongoId, obj, requestApi, sameOrigin, session, str } from '@/lib/api';
import { canManage, managedAction, uploadAsset, uploadSupplier, writeManaged } from '@/lib/managed';
import { managedOrderContext, readManagedOrder } from '@/lib/order-managed-server';
import { has } from '@/lib/sections';

export async function GET(request: Request) {
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401 });
  if (!canManage(auth.staff) || !has(auth.staff,'order.view')) return new Response('Operator access required', { status: 403 });
  const search = new URL(request.url).searchParams;
  const order = search.get('order');
  if (order !== null) {
    if (!mongoId(order)) return new Response('Order not found', { status: 404 });
    try {
      return Response.json(await readManagedOrder(order, auth), { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      return new Response(error.message, { status: error.status });
    }
  }
  const id = search.get('receipt') ?? '';
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
    const input = obj(JSON.parse((await boundedBody(request, 64_000)).toString('utf8')));
    const { action, market, id, step, key } = input;
    const values = obj(input.values);
    const order = new URL(request.url).searchParams.get('order');
    if (order !== null) {
      if (!has(auth.staff, 'order.view') || !has(auth.staff, 'order.update')) throw new ApiError(403);
      if (!mongoId(order)) throw new ApiError(404, 'Order not found.');
      const context = await managedOrderContext(order, auth);
      if (action === 'shipment-return-request') {
        if (!has(auth.staff, 'order.return') || !['IN_REVIEW', 'HANDED_OVER_TO_COURIER', 'IN_TRANSIT', 'DELIVERED', 'RETURN_REQUESTED'].includes(str(context.order.status))) {
          throw new ApiError(409, 'This order cannot be marked as pending return.');
        }
        const response = await requestApi('/order/' + order + '/mark-pending-return', auth.token, { method: 'PATCH', body: '{}' });
        if (!response.ok) throw new ApiError(response.status, 'Could not mark this order as pending return.');
        return Response.json({ id: order });
      }
      if (action === 'shipment-new') values.order = order;
      else if (action === 'shipment-action') {
        if (!context.shipments.some(shipment => shipment._id === id)) throw new ApiError(404, 'Shipment not found for this order.');
        if (['return', 'receive'].includes(str(step)) && !has(auth.staff, 'order.return')) throw new ApiError(403);
      } else if (action === 'payment-action') {
        if (context.paymentId !== id || !['review', 'collect', 'refunds'].includes(str(step))) throw new ApiError(404, 'Payment not found for this order.');
      } else throw new ApiError(404, 'Order action not found.');
    }
    if (typeof action !== 'string' || !managedAction(action)) throw new ApiError(400, 'Choose a valid operation.');
    const result = obj(await writeManaged(action, str(market), str(id), str(step), values, auth, str(key)));
    return Response.json({ id: result._id, ...(order !== null && { state: result.state }) });
  } catch (error) {
    if (error instanceof ApiError) return new Response(error.message, { status: error.status });
    if (error instanceof SyntaxError || error instanceof TypeError) return new Response('Invalid request', { status: 400 });
    throw error;
  }
}
