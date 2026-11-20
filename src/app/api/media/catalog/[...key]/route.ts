import { session } from '@/lib/api';
import { requestPinnedAdmin } from '@/lib/pinned-admin-gateway';
import { cmsMediaKey } from '@/lib/production-cms-media';
import { has } from '@/lib/sections';

async function readMedia(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (request.headers.get('sec-fetch-site') === 'cross-site') return new Response(null, { status: 403, headers });
  const auth = await session();
  if (!auth) return new Response(null, { status: 401, headers });
  if (!has(auth.staff, 'cms.view') && !has(auth.staff, 'product.view')) return new Response(null, { status: 403, headers });
  const key = (await params).key.join('/');
  if (!cmsMediaKey(key)) return new Response(null, { status: 404, headers });
  try {
    return await requestPinnedAdmin('/admin/api/media/catalog/' + key, auth.token, request);
  } catch {
    return new Response(null, { status: 502, headers });
  }
}

export const GET = readMedia;
export const HEAD = readMedia;
