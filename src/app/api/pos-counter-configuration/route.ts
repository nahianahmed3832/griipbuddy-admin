import { ApiError, sameOrigin, session, type RecordData } from '@/lib/api';
import { counterPrivate, forwardCounter } from '@/lib/counter-pos';
import { mayConfigureCounter } from '@/lib/pos-counter-configuration';

const headers = counterPrivate;
const reject = (message: string, status: number) => Response.json({ error: message }, { headers, status });

export async function PUT(request: Request) {
  if (!sameOrigin(request)) return reject('Open the counter workspace to save changes.', 403);
  const auth = await session();
  if (!auth) return reject('Sign in to continue.', 401);
  if (!mayConfigureCounter(auth, true)) return reject('Counter configuration is unavailable.', 403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json') || Number(request.headers.get('Content-Length')) > 4096) {
    return reject('Send the counter configuration as JSON.', 400);
  }
  const reader = request.body?.getReader();
  if (!reader) return reject('Send the counter configuration.', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return reject('The configuration is too large.', 413);
      }
      chunks.push(next.value);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    const input = JSON.parse(body) as unknown;
    if (input === null || typeof input !== 'object' || Array.isArray(input)) return reject('Choose a valid counter configuration.', 400);
    const data = await forwardCounter(auth, '/configuration', 'PUT', input as RecordData);
    return Response.json({ data }, { headers });
  } catch (error) {
    if (error instanceof ApiError) return reject(error.message, error.status);
    return reject('The configuration could not be confirmed. Reload and check the saved version.', 503);
  } finally {
    reader.releaseLock();
  }
}
