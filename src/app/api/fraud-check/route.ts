import { NextRequest } from 'next/server';
import { obj, session } from '@/lib/api';
import { adminPath } from '@/lib/paths';
import { pinnedAdminGatewayConfigured, requestPinnedAdmin } from '@/lib/pinned-admin-gateway';
import { has } from '@/lib/sections';

const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
const error = (message: string, status: number) => Response.json({ error: message }, { status, headers });

export async function GET(request: NextRequest) {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return error('Permission denied.', 403);
  const auth = await session();
  if (!auth) return new Response(null, { status: 302, headers: { ...headers, Location: adminPath('/sign-in') } });
  if (!has(auth.staff, 'order.view')) return error('Permission denied.', 403);

  const phone = request.nextUrl.searchParams.get('phone');
  if (!phone) return error('Phone number is required', 400);
  if (!/^01\d{9}$/.test(phone)) return error('Please enter a valid 11-digit phone number', 400);
  if (process.env.GRIIP_ADMIN_FRAUD_LOOKUP !== '1' || !pinnedAdminGatewayConfigured()) {
    return error('Failed to fetch fraud data', 500);
  }

  try {
    const response = await requestPinnedAdmin('/admin/api/fraud-check?phone=' + phone, auth.token, request);
    if (response.status === 429) return error('Wait before making another lookup', 429);
    if (!response.ok) return error('Failed to fetch fraud data', 500);
    const payload = await response.json();
    const { successRate } = obj(obj(payload).data);
    if (typeof successRate !== 'number' || !Number.isFinite(successRate)) return error('Failed to fetch fraud data', 500);
    return Response.json(payload, { headers });
  } catch {
    return error('Failed to fetch fraud data', 500);
  }
}
