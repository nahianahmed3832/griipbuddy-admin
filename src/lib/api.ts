import { cache } from 'react';
import { cookies } from 'next/headers';
import { has, superAdmin, type Region, type Staff } from './sections';

export type RecordData = Record<string, unknown>;
export const obj = (value: unknown): RecordData => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordData : {};
export const arr = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const str = (value: unknown) => typeof value === 'string' ? value : '';
export const mongoId = (value: string) => /^[a-f0-9]{24}$/i.test(value);
export const sessionCookie = 'griip_admin_step8';

export class ApiError extends Error {
  constructor(public status: number, message = 'The recovery API could not complete this request.') {
    super(message);
  }
}

export function connection() {
  if (process.env.GRIIP_ADMIN_TARGET === 'preview') {
    return { origin: 'http://127.0.0.1:14811', name: 'Isolated frontend preview', legacy: null };
  }
  if (process.env.GRIIP_ADMIN_TARGET === 'fixture') {
    return { origin: 'http://127.0.0.1:38100', name: 'Local fixture', legacy: null };
  }
  if (process.env.GRIIP_ADMIN_TARGET === undefined || process.env.GRIIP_ADMIN_TARGET === 'staging') {
    return { origin: 'http://127.0.0.1:14801', name: 'Isolated staging', legacy: 'http://127.0.0.1:14801/dashboard/' };
  }
  throw new Error('Invalid admin target');
}

export function hosted() {
  return ['https://dev.griipbuddy.com', 'https://frontend.griipbuddy.com'].includes(process.env.GRIIP_ADMIN_PUBLIC_ORIGIN ?? '');
}

export function canWrite(staff: Staff) {
  const target = connection().name;
  const local = target === 'Local fixture' && process.env.GRIIP_ADMIN_FIXTURE_WRITES === '1';
  const stage = target === 'Isolated staging' && hosted() && process.env.GRIIP_ADMIN_STAGE_WRITES === '1';
  const preview = target === 'Isolated frontend preview' && process.env.GRIIP_ADMIN_PUBLIC_ORIGIN === 'https://frontend.griipbuddy.com';
  return superAdmin(staff) && (local || stage || preview);
}

export function legacyUrl(path?: string) {
  const base = connection().legacy;
  if (!base || !path || !/^[a-zA-Z0-9_/-]+$/.test(path)) return undefined;
  return base + path;
}

export async function requestApi(path: string, token?: string, init?: RequestInit) {
  if (!/^\/[a-z0-9/-]+(?:\?[^#]*)?$/i.test(path) || path.includes('//')) throw new Error('Invalid recovery API path');
  try {
    return await fetch(connection().origin + '/api/v1' + path, {
      ...init, headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(503, 'The isolated recovery API is unavailable.');
  }
}

export async function api(path: string, token?: string, init?: RequestInit): Promise<unknown> {
  const res = await requestApi(path, token, init);
  if (!res.ok) throw new ApiError(res.status);
  const payload = obj(await res.json());
  if (/^\/stocks\/adjustment(?:\?|$)/.test(path) && Array.isArray(payload.data)) return payload;
  if (payload.success !== true) throw new ApiError(502);
  return payload.data;
}

export async function who(token: string): Promise<Staff | null> {
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token) || token.length > 2048) return null;
  try {
    const user = obj(await api('/user', token));
    if (!mongoId(str(user._id)) || !user.role_ref || !user.role || user.role === 'USER' || user.isDeleted || user.status !== 'ACTIVE') return null;
    if (process.env.GRIIP_ADMIN_TARGET === 'preview' && str(user.phone_number) !== process.env.GRIIP_ADMIN_STAFF_PHONE) return null;
    return { id: str(user._id), name: str(user.full_name) || 'Staff member', role: str(user.role),
      permissions: arr(user.permissions).filter((key): key is string => typeof key === 'string') };
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) return null;
    // Recovered verifyToken reports expired or malformed JWTs as HTTP 500.
    if (error instanceof ApiError && error.status === 500) return null;
    throw error;
  }
}

export const session = cache(async () => {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) return null;
  const staff = await who(token);
  return staff ? { token, staff } : null;
});

export type Session = NonNullable<Awaited<ReturnType<typeof session>>>;

export function getRegion(value: string | undefined, staff: Staff): Region {
  if (value === 'INTERNATIONAL' && !has(staff, 'international.access')) throw new ApiError(403);
  return value === 'INTERNATIONAL' ? 'INTERNATIONAL' : 'BD';
}

export function sameOrigin(request: Request) {
  const host = request.headers.get('host');
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  if (hosted()) return 'https://' + host === process.env.GRIIP_ADMIN_PUBLIC_ORIGIN && request.headers.get('origin') === process.env.GRIIP_ADMIN_PUBLIC_ORIGIN;
  return /^127\.0\.0\.1:\d{4,5}$/.test(host ?? '') && request.headers.get('origin') === 'http://' + host;
}

export function url(path: string, params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return query.size ? path + '?' + query.toString() : path;
}
