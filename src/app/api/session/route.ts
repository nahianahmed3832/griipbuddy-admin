import { NextRequest, NextResponse } from 'next/server';
import { adminPath, prefix } from '@/lib/paths';
import { api, ApiError, hosted, obj, sameOrigin, sessionCookie, str, who } from '@/lib/api';

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return new Response('Origin denied', { status: 403 });
  if (Number(req.headers.get('content-length')) > 4096 || !req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) {
    return new Response('Invalid form', { status: 400 });
  }
  const raw = await req.text();
  if (raw.length > 4096) return new Response('Invalid form', { status: 400 });
  const form = new URLSearchParams(raw);
  const redirect = (path: string) => new NextResponse(null, { status: 303, headers: { Location: adminPath(path) } });
  if (form.get('action') === 'signout') {
    const response = redirect('/sign-in');
    response.cookies.set(sessionCookie, '', { path: prefix || '/', secure: hosted(), maxAge: 0, httpOnly: true, sameSite: 'strict' });
    return response;
  }
  const identifier = (form.get('phone') ?? '').trim();
  const staffEmail = process.env.GRIIP_ADMIN_STAFF_EMAIL?.trim().toLowerCase();
  const staffPhone = process.env.GRIIP_ADMIN_STAFF_PHONE;
  const phone_number = staffEmail && identifier.toLowerCase() === staffEmail
    ? staffPhone ?? ''
    : identifier;
  const password = form.get('password') ?? '';
  if (!/^\+?\d{8,16}$/.test(phone_number) || password.length < 6 || password.length > 200) return redirect('/sign-in?error=credentials');
  if (process.env.GRIIP_ADMIN_TARGET === 'preview' && phone_number !== staffPhone) return redirect('/sign-in?error=credentials');
  try {
    const result = obj(await api('/user/admin/login', undefined, { method: 'POST', body: JSON.stringify({ phone_number, password }) }));
    const token = str(result.access_token);
    if (!token || !await who(token)) return redirect('/sign-in?error=credentials');
    const response = redirect('/desk/overview');
    response.cookies.set(sessionCookie, token, { httpOnly: true, sameSite: 'strict', path: prefix || '/', secure: hosted(), maxAge: 3600 });
    return response;
  } catch (error) {
    return redirect('/sign-in?error=' + (error instanceof ApiError && error.status >= 500 ? 'unavailable' : 'credentials'));
  }
}
