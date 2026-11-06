import Link from 'next/link';
import { api, ApiError, arr, canWrite, mongoId, obj, str, type Session } from '@/lib/api';
import { advancedEnabled, loadLocations, paymentAccounts, reference } from '@/lib/advanced';
import { has, type Region } from '@/lib/sections';
import { ContentEditor } from './content-editor';
import { PageHeading } from './dashboard';
import { PosEditor, type SaleDraft } from './pos-editor';

export async function SaleWorkspace({ auth, id, region }: { auth: Session; id?: string; region: Region }) {
  if (!advancedEnabled() || !canWrite(auth.staff) || !has(auth.staff, 'pos.view') || !has(auth.staff, id ? 'pos.update' : 'pos.create')) {
    throw new ApiError(403);
  }
  if (region !== 'BD' || id && !mongoId(id)) throw new ApiError(404);
  const [locations, accounts, raw] = await Promise.all([
    loadLocations(auth, region), has(auth.staff, 'expense.view') ? paymentAccounts(auth) : [],
    id ? api('/pos/sale/' + id, auth.token) : null,
  ]);
  const sale = obj(raw);
  if (id && obj(sale.business_location).region !== region) throw new ApiError(404);
  const discount = (value: unknown) => ({ type: str(obj(value).type) || 'FLAT', value: String(obj(value).value ?? 0) });
  const draft: SaleDraft = {
    id, revision: str(sale.updatedAt), location: reference(sale.business_location), customer: str(sale.customer_phone),
    paymentMethod: str(sale.payment_method) || 'Cash', paymentAccount: reference(sale.payment_account),
    paid: String(sale.paid_amount ?? 0), discount: discount(sale.overall_discount), note: str(sale.sale_note), paymentNote: str(sale.payment_note),
    lines: arr(sale.products).map(obj).map(row => ({ sku: str(obj(row.selected_variant).sku),
      quantity: String(row.quantity ?? 1), discount: discount(row.product_discount) })),
  };
  return <>
    <PageHeading eyebrow="COMMERCE / POINT OF SALE" title={id ? 'Edit POS sale' : 'New POS sale'}
      description="Record items, discounts and offline payments for a Bangladesh location. Existing sale lines retain their price snapshots.">
      <Link className="button secondary" href={'/desk/pos/sales' + (id ? '/' + id : '')}>Back to sales</Link>
    </PageHeading>
    <PosEditor draft={draft} locations={locations} accounts={accounts}/>
  </>;
}

export async function ContentWorkspace({ auth }: { auth: Session }) {
  if (!advancedEnabled() || !has(auth.staff, 'cms.view')) throw new ApiError(403);
  const doc = obj(await api('/cms/admin/workspace', auth.token));
  return <>
    <PageHeading eyebrow="STOREFRONT / CONTENT" title="Content and SEO"
      description="Edit the shared storefront content, homepage merchandising and page metadata."/>
    <ContentEditor key={str(doc.updatedAt)} doc={doc} writable={canWrite(auth.staff) && has(auth.staff, 'cms.update')}/>
  </>;
}
