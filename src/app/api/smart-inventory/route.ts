import { ApiError, getRegion, session } from '@/lib/api';
import { canOperate } from '@/lib/operations';
import { has } from '@/lib/sections';
import { barcodeVariants, validateReceiptScan } from '@/lib/smart-inventory';

export async function GET(request: Request) {
  const auth = await session();
  if (!auth) return new Response('Sign in required', { status: 401 });
  const query = new URL(request.url).searchParams;
  const action = query.get('action');
  const value = (query.get('q') ?? '').trim();
  try {
    const region = getRegion(query.get('region') ?? undefined, auth.staff);
    if (action === 'variants' && canOperate(auth.staff, 'barcode-generate')) {
      return Response.json(await barcodeVariants(value, auth, region));
    }
    if (action === 'catalog-variants' && has(auth.staff, 'barcode.view') && has(auth.staff, 'product.view') && value.length >= 2) {
      return Response.json(await barcodeVariants(value, auth, region));
    }
    if (action === 'validate' && canOperate(auth.staff, 'barcode-receive')) {
      return Response.json(await validateReceiptScan(value, auth, region));
    }
    return new Response('Access restricted', { status: 403 });
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return new Response(error.status >= 500 ? 'Smart Inventory could not reach the recovery API.' : error.message, { status: error.status });
  }
}
