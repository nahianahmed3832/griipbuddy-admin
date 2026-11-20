import { readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { session } from '@/lib/api';
import { financeAttachmentKey } from '@/lib/finance-attachment';
import { has } from '@/lib/sections';

export async function GET(_: Request, { params }: { params: Promise<{ key: string }> }) {
  const auth = await session();
  if (!auth || !has(auth.staff, 'expense.view')) return new Response(null, { status: 404 });
  const { key } = await params;
  const location = process.env.GRIIP_ADMIN_EXPENSE_MEDIA_DIR ?? '';
  if (!financeAttachmentKey.test(key) || !isAbsolute(location)) return new Response(null, { status: 404 });
  const image = await readFile(join(location, key)).catch(() => null);
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image), { headers: {
    'Cache-Control': 'private, no-store', 'Content-Type': 'image/png', 'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline; filename="expense-attachment.png"',
  } });
}
