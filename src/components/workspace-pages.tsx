import Link from 'next/link';
import { api, ApiError, arr, canWrite, mongoId, obj, str, url, type Session } from '@/lib/api';
import { loadCategoryTree } from '@/lib/catalog-list';
import { advancedEnabled, loadLocations, paymentAccounts, reference } from '@/lib/advanced';
import { has, type Region } from '@/lib/sections';
import { pinnedAdminGatewayConfigured } from '@/lib/pinned-admin-gateway';
import { ContentEditor } from './content-editor';
import { ProductionFeaturedProducts, type FeaturedVariant } from './production-featured-products';
import { ProductionNewArrivals } from './production-new-arrivals';
import { contentProduct, productReferences } from '@/lib/content-products';
import { ProductionBannerEditor } from './production-banner-editor';
import { PageHeading } from './dashboard';
import { PosEditor, type SaleDraft } from './pos-editor';
import { ProductionPosEditor } from './production-pos-editor';
import { posDay, posMethods } from '@/lib/pos';
import { readPosSale } from '@/lib/production-pos';

export async function SaleWorkspace({ auth, id, region, production = false }: { auth: Session; id?: string; region: Region; production?: boolean }) {
  if (!advancedEnabled() || !canWrite(auth.staff) || !has(auth.staff, 'pos.view') || !has(auth.staff, id ? 'pos.update' : 'pos.create')) {
    throw new ApiError(403);
  }
  if (region !== 'BD' || id && !mongoId(id)) throw new ApiError(404);
  const [locations, accounts, raw] = await Promise.all([
    loadLocations(auth, region), !production && has(auth.staff, 'expense.view') ? paymentAccounts(auth) : [],
    id ? readPosSale(id, auth) : null,
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
  if (production) {
    const saleDate = str(sale.sale_date);
    const paymentMethod = [...posMethods, 'Bank transfer'].find(method => method.toLowerCase() === draft.paymentMethod.toLowerCase()) || 'Other';
    const lines = arr(sale.products).map(obj).map((row, index) => ({
      ...draft.lines[index], name: str(obj(row.product).name),
      attributes: Object.values(obj(obj(row.selected_variant).attribute_values)).map(str).filter(Boolean).join(' - '),
      regularPrice: Number(obj(row.selected_variant).regular_price) || 0,
      salePrice: Number(obj(row.selected_variant).sale_price) || 0,
    }));
    return <ProductionPosEditor draft={{ ...draft, lines, paymentMethod, serial: String(sale.sale_serial_id ?? ''),
      day: saleDate && !Number.isNaN(Date.parse(saleDate)) ? posDay(new Date(saleDate)) : posDay(),
      customerName: str(obj(sale.user).full_name),
    }} locations={locations} canSearchCustomers={has(auth.staff, 'user.view')} canCreateCustomer={has(auth.staff, 'user.create')}/>;
  }
  return <>
    <PageHeading eyebrow="COMMERCE / POINT OF SALE" title={id ? 'Edit POS sale' : 'New POS sale'}
      description="Record items, discounts and offline payments for a Bangladesh location. Existing sale lines retain their price snapshots.">
      <Link className="button secondary" href={'/desk/pos/sales' + (id ? '/' + id : '')}>Back to sales</Link>
    </PageHeading>
    <PosEditor draft={draft} locations={locations} accounts={accounts}/>
  </>;
}

export async function ContentWorkspace({ auth, section, region, production = false }: { auth: Session; section?: string; region: Region; production?: boolean }) {
  if (region !== 'BD' || !has(auth.staff, 'cms.view')) throw new ApiError(403);
  if (production && section === 'featured_products') {
    const variants = await api('/cms/admin/featured-variants', auth.token) as FeaturedVariant[];
    const writable = advancedEnabled() && canWrite(auth.staff);
    return <ProductionFeaturedProducts initial={variants}
      canAdd={writable && has(auth.staff, 'cms.create') && has(auth.staff, 'product.view')}
      canRemove={writable && has(auth.staff, 'cms.delete')}/>;
  }
  const [doc, categories] = await Promise.all([
    api('/cms/admin/workspace', auth.token).then(obj),
    !section || section === 'homepage.shop_by_category' ? loadCategoryTree(auth).catch(() => []) : [],
  ]);
  const carouselEnabled = !production && process.env.GRIIP_ADMIN_TARGET === 'integration';
  const allowUploads = production ? pinnedAdminGatewayConfigured() : carouselEnabled && Boolean(process.env.GRIIP_ADMIN_CAMPAIGN_MEDIA_DIR);
  const writable = advancedEnabled() && canWrite(auth.staff) && has(auth.staff, 'cms.update');
  const allowProducts = has(auth.staff, 'product.view');
  const references = production && allowProducts ? [...new Set(
    section === 'banners'
      ? [doc.banners, doc.mobile_banners, doc.featured_products].flatMap(productReferences)
      : section?.startsWith('homepage.') ? productReferences(obj(doc.homepage)[section.split('.')[1]]) : [],
  )] : [];
  const products = (await Promise.all(Array.from({ length: Math.ceil(references.length / 100) }, (_, chunk) =>
    api(url('/cms/admin/workspace-products', { ids: references.slice(chunk * 100, chunk * 100 + 100).join(',') }), auth.token)
      .then(arr).catch(() => [])))).flat().map(contentProduct);
  if (production && section === 'homepage.new_arrivals') return <ProductionNewArrivals key={str(doc.updatedAt)}
    doc={doc} products={products} writable={writable} allowProducts={allowProducts}/>;
  if (production && section === 'banners') return <ProductionBannerEditor doc={doc}
    writable={writable} allowUploads={allowUploads} allowProducts={allowProducts} products={products}/>;
  if (production) return <ContentEditor key={str(doc.updatedAt)} doc={doc} initialSection={section} categories={categories}
    carouselEnabled={false} production allowProductSearch={allowProducts} allowUploads={allowUploads} writable={writable} productOptions={products}/>;
  return <>
    <PageHeading eyebrow="STOREFRONT / CONTENT" title={section ? ({hero_section:carouselEnabled ? 'Homepage carousel' : 'Hero section', 'homepage.shop_by_category':'Shop by category', 'homepage.best_selling':'Best selling', 'homepage.new_arrivals':'New arrivals', 'homepage.leather_section':'Leather section', banners:'Banners', featured_products:'Featured products'}[section] ?? 'Storefront content') : 'Content and SEO'}
      description="Edit store content and homepage merchandising.">
      <Link className="button secondary" prefetch={false} href={url("/desk/content/" + (section ? (Object.entries(contentViews).find(([, key]) => key === section)?.[0] ?? "workspace") : "workspace"), {region, refresh: String(Date.now())})}>Refresh</Link>
    </PageHeading>
    <ContentEditor key={str(doc.updatedAt)} doc={doc} initialSection={section} categories={categories} carouselEnabled={carouselEnabled}
      allowProductSearch={has(auth.staff, 'product.view')} allowUploads={allowUploads} writable={writable}/>
  </>;
}

export const contentViews: Record<string, string> = {
  hero: 'hero_section', 'shop-by-category': 'homepage.shop_by_category', 'best-selling': 'homepage.best_selling',
  'new-arrivals': 'homepage.new_arrivals', 'leather-section': 'homepage.leather_section',
  banners: 'banners', 'featured-products': 'featured_products',
};
