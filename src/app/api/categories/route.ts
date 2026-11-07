import { ApiError, mongoId, obj, requestApi, sameOrigin, session, str } from '@/lib/api';
import { canChangeCategories } from '@/lib/category-workspace';

const invalid = (error: string, status = 400) => Response.json({ error }, { status });
const maxImage = 8 * 1024 * 1024;

async function mutate(request: Request, method: 'POST' | 'PATCH') {
  if (!sameOrigin(request)) return invalid('Use the category editor to save changes.', 403);
  try {
    const auth = await session();
    if (!auth) return invalid('Sign in to manage categories.', 401);
    const params = new URL(request.url).searchParams;
    const upload = params.get('upload') === '1';
    const reorder = params.get('reorder') === '1';
    if (reorder && method !== 'POST') return invalid('Choose a valid category action.');
    if (upload) {
      if (method !== 'POST' || !(['product.create', 'product.update'] as const).some(permission => canChangeCategories(auth, permission))) {
        return invalid('You do not have access to upload category images.', 403);
      }
      const size = Number(request.headers.get('content-length'));
      const type = request.headers.get('content-type') ?? '';
      if (!Number.isSafeInteger(size) || size < 1 || size > maxImage || !['image/jpeg','image/png','image/webp'].includes(type)) {
        return invalid('Choose a JPEG, PNG or WebP image up to 8 MB.', 415);
      }
      const bytes = await request.arrayBuffer();
      if (bytes.byteLength !== size) return invalid('The upload was incomplete.');
      const body = new FormData();
      body.append('files', new Blob([bytes], { type }), 'category-image');
      const result = await requestApi('/catalog/media/upload', auth.token, { method, body });
      return categoryResponse(result, true);
    }
    if (!canChangeCategories(auth, method === 'POST' && !reorder ? 'product.create' : 'product.update')) {
      return invalid('You do not have access to save category changes.', 403);
    }
    if (!request.headers.get('content-type')?.startsWith('application/json')) return invalid('Expected a category form.');
    const data = await request.text();
    if (data.length > 20000) return invalid('Category changes exceed the form limit.', 413);
    const parsed = obj(JSON.parse(data));
    const { depth, id, ...body } = parsed;
    if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 0 || depth > 3 ||
      (method === 'PATCH' || reorder ? !mongoId(str(id)) : id !== undefined)) return invalid('Choose a valid category.');
    return categoryResponse(await requestApi('/catalog/category-tree/' + depth + (method === 'PATCH' || reorder ? '/' + id : '') + (reorder ? '/reorder' : ''),
      auth.token, { method, body: JSON.stringify(body) }), false, reorder);
  } catch (error) {
    if (error instanceof SyntaxError) return invalid('The category form is invalid.');
    return invalid('The category service could not confirm this change. Reload before retrying.',
      error instanceof ApiError ? error.status : 502);
  }
}

async function categoryResponse(response: Response, upload: boolean, reorder = false) {
  const payload = obj(await response.json().catch(() => null));
  if (response.ok && payload.success === true) {
    const asset = upload && Array.isArray(payload.data) ? obj(payload.data[0]) : {};
    return Response.json(upload ? { url: str(asset.url) } : reorder ? { nodes: payload.data } : { node: payload.data }, { status: response.status });
  }
  const issue = obj(Array.isArray(payload.errorMessages) ? payload.errorMessages[0] : null);
  const detail = [str(issue.path).replaceAll('_', ' '), str(issue.message)].filter(Boolean).join(': ').slice(0,260);
  const status = response.ok ? 502 : response.status;
  return invalid(status === 409 && /identifier/.test(detail) ? 'That slug is already used at this level. Choose another.' :
    status === 403 ? 'You do not have access to manage categories.' :
    status === 404 ? 'The category or editor is no longer available.' :
    [400,409,422].includes(status) && detail ? detail :
      upload ? 'Category image storage is unavailable. Try a direct HTTPS image URL.' :
        'The category service could not confirm this change. Reload before retrying.', status);
}

export const POST = (request: Request) => mutate(request, 'POST');
export const PATCH = (request: Request) => mutate(request, 'PATCH');
