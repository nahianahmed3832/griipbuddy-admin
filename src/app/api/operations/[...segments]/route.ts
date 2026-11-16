import { NextResponse, type NextRequest } from 'next/server';
import { ApiError, getRegion, operationsEnabled, sameOrigin, session } from '@/lib/api';
import { opsApi } from '@/lib/operations-desk';

const mutations = /^(?:refresh|support|assistant|purchases(?:\/[a-f0-9]{24})?|cod(?:\/[a-f0-9]{64}|\/orders\/[a-f0-9]{24}\/collect)?|issues\/[a-f0-9]{64}(?:\/cancel-order)?|(?:packing|fulfillment)\/[a-f0-9]{24}|work\/(?:queue|pause|[a-f0-9]{64}(?:\/rule)?))$/;

export async function POST(request: NextRequest, { params }: { params: Promise<{ segments?: string[] }> }) {
  if (!operationsEnabled()) return new Response(null, { status: 404 });
  if (!sameOrigin(request)) return new Response(null, { status: 403 });
  const auth = await session();
  if (!auth) return new Response(null, { status: 401 });
  const path = (await params).segments?.join('/') ?? '';
  if (!mutations.test(path)) return new Response(null, { status: 404 });
  try {
    const query = request.nextUrl.searchParams;
    const market = getRegion(query.get('region') ?? undefined, auth.staff);
    if (Number(request.headers.get('content-length')) > 12288 || !request.headers.get('content-type')?.startsWith('application/json')) {
      throw new ApiError(400, 'Invalid request.');
    }
    const reader = request.body?.getReader();
    const chunks = [];
    let length = 0;
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 12288) {
        await reader.cancel();
        throw new ApiError(413, 'Request is too large.');
      }
      chunks.push(value);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    const result = await opsApi(auth, market, path, { from: query.get('from') ?? undefined, to: query.get('to') ?? undefined }, body);
    return NextResponse.json({ success: true, data: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return NextResponse.json({ success: false, message: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ segments?: string[] }> }) {
  if (!operationsEnabled()) return new Response(null, { status: 404 });
  const path = (await params).segments?.join('/') ?? '';
  if (!/^purchases\/(?:choices|[a-f0-9]{24}(?:\/labels\/[a-f0-9]{24})?)$/.test(path)) return new Response(null, { status: 404 });
  const auth = await session();
  if (!auth) return new Response(null, { status: 401 });
  try {
    const query = request.nextUrl.searchParams;
    const market = getRegion(query.get('region') ?? undefined, auth.staff);
    const result = await opsApi(auth, market, path, { sku: query.get('sku') ?? undefined, supplier: query.get('supplier') ?? undefined });
    return NextResponse.json({ success: true, data: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return NextResponse.json({ success: false, message: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
