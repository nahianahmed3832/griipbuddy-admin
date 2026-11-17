import { type NextRequest } from 'next/server';
import { ApiError, obj, sameOrigin, session, str } from '@/lib/api';
import { requireWrite } from '@/lib/advanced';
import { requestPinnedAdmin } from '@/lib/pinned-admin-gateway';
import { localCmsUpload } from '@/lib/production-cms-media';

const headers = { 'Cache-Control': 'private, no-store' };
const origin = 'https://devadmin.griipbuddy.com';
const mediaPath = '/admin/api/media/catalog/';
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail('Origin denied', 403);
  const auth = await session();
  if (!auth) return fail('Sign in to upload media.', 401);
  try {
    requireWrite(auth, 'cms.view', 'cms.update');
    const kind = request.nextUrl.searchParams.get('kind');
    if (kind !== 'video' && kind !== 'image') return fail('Choose an image or video.', 400);
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data;') || !request.body) {
      return fail('Choose a file to upload.', 400);
    }
    const fileLimit = kind === 'video' ? 50 : 5;
    const length = Number(request.headers.get('content-length'));
    if (!Number.isSafeInteger(length) || length <= 0 || length > fileLimit * 1024 * 1024 + 8192) {
      return fail(`The file can be up to ${fileLimit} MB.`, 413);
    }
    const response = await requestPinnedAdmin(kind === 'video' ? '/admin/api/media/video/upload' : '/admin/api/v1/upload/single', auth.token, request);
    if (!response.ok) return fail('Could not upload the file.', response.status);
    const payload = obj(await response.json());
    const url = str(payload.secure_url);
    const key = kind === 'video' && url.startsWith(origin + mediaPath) ? url.slice((origin + mediaPath).length) : str(obj(payload.data).url);
    if (!localCmsUpload(key)) return fail('Could not upload the file.', 502);
    return Response.json({ url: origin + mediaPath + key }, { headers });
  } catch (error) {
    return fail('Could not upload the file.', error instanceof ApiError ? error.status : 503);
  }
}
