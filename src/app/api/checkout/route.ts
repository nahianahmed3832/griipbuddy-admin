import { NextRequest } from 'next/server';
import { ApiError, sameOrigin, session } from '@/lib/api';
import { checkoutRequest } from '@/lib/checkout';
import { superAdmin } from '@/lib/sections';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status:401 });
  if (!superAdmin(auth.staff)) return new Response('Checkout admin permission required', { status:403 });
  const id = req.nextUrl.searchParams.get('receipt');
  if (!id || !uuid.test(id)) return new Response('Receipt not found', { status:404 });
  try {
    const metadata = req.nextUrl.searchParams.get('format') === 'metadata';
    const upstream = await checkoutRequest(id,undefined,metadata);
    if (metadata) {
      if (!upstream.ok) return new Response('Receipt unavailable',{status:upstream.status});
      const { phone, reference } = await upstream.json();
      if (typeof phone !== 'string' || typeof reference !== 'string') return new Response('Receipt unavailable',{status:502});
      return Response.json({phone,reference},{headers:{'Cache-Control':'private, no-store'}});
    }
    if (!upstream.ok || upstream.headers.get('content-type') !== 'image/jpeg') return new Response('Receipt unavailable', { status: upstream.ok ? 502 : upstream.status });
    return new Response(upstream.body,{headers:{'Content-Type':'image/jpeg','Content-Disposition':'attachment; filename="receipt.jpg"','Cache-Control':'private, no-store'}});
  } catch (error) {
    return new Response('Receipt unavailable', { status:error instanceof ApiError ? error.status : 503 });
  }
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new Response('Origin denied',{status:403});
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status:401 });
  if (!superAdmin(auth.staff)) return new Response('Checkout admin permission required', { status:403 });
  if (Number(req.headers.get('content-length')) > 6000 || !req.headers.get('content-type')?.startsWith('application/json')) return new Response('Invalid payload', { status:400 });
  const raw = await req.text();
  if (raw.length > 6000) return new Response('Invalid payload',{status:400});
  try {
    const data = JSON.parse(raw);
    if (!data || !['settings','approve-receipt','reject-receipt'].includes(data.action)) return new Response('Unknown action',{status:400});
    const upstream = await checkoutRequest(undefined,{...data,actor:auth.staff.id});
    if (!upstream.ok) {
      const body = await upstream.json().catch(() => ({}));
      return Response.json({ error:typeof body.error === 'string' ? body.error : 'Checkout sandbox rejected this request.' },{status:upstream.status});
    }
    return Response.json({ saved:true });
  } catch (error) {
    return Response.json({ error:'Checkout change could not be completed.' },{status:error instanceof ApiError ? error.status : 400});
  }
}
