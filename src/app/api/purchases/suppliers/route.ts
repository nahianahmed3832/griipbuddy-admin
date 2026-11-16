import { NextRequest } from 'next/server';
import { ApiError, mongoId, obj, requestApi, sameOrigin, session, str } from '@/lib/api';
import { supplierFields, supplierTypes } from '@/lib/supplier-fields';
import { supplierWrite } from '@/lib/suppliers';

const headers = { 'Cache-Control': 'private, no-store' };
const reject = (status: number, message: string) => new Response(message, { status, headers });

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return reject(403, 'Origin denied.');
  const auth = await session();
  if (!auth) return reject(401, 'Sign in required.');
  const id = req.nextUrl.searchParams.get('id');
  const remove = req.nextUrl.searchParams.get('action') === 'delete';
  if ((id !== null && !mongoId(id)) || (remove && !id)) return reject(400, 'Invalid supplier.');
  if (!supplierWrite(auth.staff, remove ? 'delete' : id ? 'update' : 'create')) return reject(403, 'Access restricted.');
  try {
    let payload: Record<string, string | number> | undefined;
    if (!remove) {
      if (!req.headers.get('content-type')?.startsWith('application/json') || Number(req.headers.get('content-length')) > 10000) {
        return reject(400, 'Invalid supplier details.');
      }
      const raw = await req.text();
      if (Buffer.byteLength(raw) > 10000) return reject(413, 'Supplier details are too large.');
      let body;
      try { body = obj(JSON.parse(raw)); } catch { return reject(400, 'Invalid supplier details.'); }
      const type = supplierTypes.find(option => option === body.type);
      if (!type) return reject(400, 'Choose a supplier type.');
      payload = { type };
      for (const { name, label, max } of supplierFields) {
        const value = str(body[name]).trim();
        if (value.length > max) return reject(400, label + ' is too long.');
        payload[name] = value;
      }
      const contact = str(payload.contact_id);
      if (!payload.name || !/^\d{1,8}$/.test(contact) || Number(contact) < 1) return reject(400, 'Enter a name and a valid contact reference number.');
      if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str(payload.email))) return reject(400, 'Enter a valid email address.');
      payload.contact_id = Number(contact);
    }
    const result = await requestApi(id ? '/supplier/' + id : '/supplier', auth.token, {
      method: remove ? 'DELETE' : id ? 'PATCH' : 'POST', ...(payload && { body: JSON.stringify(payload) }),
    });
    const response = obj(await result.json());
    if (!result.ok || response.success !== true) {
      if ([400, 409, 422].includes(result.status)) return reject(result.status, 'Check the supplier name and contact reference. Both must be unique.');
      if ([401, 403, 404].includes(result.status)) return reject(result.status, 'The supplier could not be accessed.');
      return reject(502, 'The purchasing service could not confirm the change.');
    }
    const savedId = remove ? id : str(obj(response.data)._id);
    return Response.json({ id: savedId }, { headers });
  } catch (error) {
    if (error instanceof ApiError) return reject(error.status, error.message);
    throw error;
  }
}
