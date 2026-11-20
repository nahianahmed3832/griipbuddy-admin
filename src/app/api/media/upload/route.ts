import { type NextRequest } from 'next/server';
import { ApiError, obj, sameOrigin, session, str } from '@/lib/api';
import { canChangeCategories } from '@/lib/category-workspace';
import { canEditProduct } from '@/lib/catalog-admin';
import { requireWrite } from '@/lib/advanced';
import { legacyCatalogAuthoringRetired } from '@/lib/connected-catalog';
import { requestPinnedAdmin } from '@/lib/pinned-admin-gateway';
import { localCmsUpload } from '@/lib/production-cms-media';
import { verifyScopedLegacyCatalogWrite } from '@/lib/scoped-catalog-pilot';
import { isEditableAdminOrigin, legacyEditableAdminOrigin } from '@/lib/admin-origins';

const headers = { 'Cache-Control': 'private, no-store' };
const mediaPath = '/admin/api/media/catalog/';
const fail = (error: string, status: number) => Response.json({ error }, { status, headers });

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail('Origin denied', 403);
  const auth = await session();
  if (!auth) return fail('Sign in to upload media.', 401);
  try {
    const origin = process.env.GRIIP_ADMIN_PUBLIC_ORIGIN;
    if (!origin || !isEditableAdminOrigin(origin)) return fail('Media upload is unavailable on this host.', 404);
    const scope = request.nextUrl.searchParams.get('scope');
    if ((scope === 'product' || scope === 'category') && legacyCatalogAuthoringRetired()) {
      return fail('Upload catalog media from the connected workspace.', 410);
    }
    if (scope === 'product') {
      if (!canEditProduct('create', auth) && !canEditProduct('edit', auth)) return fail('Upload access denied.', 403);
    } else if (scope === 'category') {
      if (!canChangeCategories(auth, 'product.create') && !canChangeCategories(auth, 'product.update')) return fail('Upload access denied.', 403);
    } else if (scope === 'customer') {
      requireWrite(auth, 'user.view', 'user.create');
      if (request.nextUrl.searchParams.get('kind') !== 'image') return fail('Choose a customer photo.', 400);
    } else requireWrite(auth, 'cms.view', 'cms.update');
    if (scope === 'product' || scope === 'category') await verifyScopedLegacyCatalogWrite(auth);
    const kind = request.nextUrl.searchParams.get('kind');
    if (kind !== 'video' && kind !== 'image') return fail('Choose an image or video.', 400);
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data;') || !request.body) {
      return fail('Choose a file to upload.', 400);
    }
    const fileLimit = kind === 'video' ? (scope === 'product' ? 500 : 50) : 5;
    const length = Number(request.headers.get('content-length'));
    if (!Number.isSafeInteger(length) || length <= 0 || length > fileLimit * 1024 * 1024 + 8192) {
      return fail(`The file can be up to ${fileLimit} MB.`, 413);
    }
    const response = await requestPinnedAdmin(kind === 'video' ? '/admin/api/media/video/upload' : '/admin/api/v1/upload/single', auth.token, request);
    if (!response.ok) return fail('Could not upload the file.', response.status);
    const payload = obj(await response.json());
    const url = str(payload.secure_url);
    const gatewayPath = legacyEditableAdminOrigin + mediaPath;
    const key = kind === 'video' && url.startsWith(gatewayPath) ? url.slice(gatewayPath.length) : str(obj(payload.data).url);
    if (!localCmsUpload(key)) return fail('Could not upload the file.', 502);
    return Response.json({ url: origin + mediaPath + key }, { headers });
  } catch (error) {
    return fail('Could not upload the file.', error instanceof ApiError ? error.status : 503);
  }
}
