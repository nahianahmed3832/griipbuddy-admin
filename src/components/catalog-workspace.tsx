import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { api, ApiError, arr, canWrite, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { reference } from '@/lib/advanced';
import { canEditProduct, canEditRegistry, readProduct, readRegistry, registryOptions } from '@/lib/catalog-admin';
import { currencies, productFields, registries, statusOptions, type Registry } from '@/lib/catalog-edit-fields';
import { catalogFilters, catalogParams, catalogPath, loadCategoryTree } from '@/lib/catalog-list';
import { categoryName, type CategoryNode } from '@/lib/category-tree';
import { canChangeCategories, loadCategories } from '@/lib/category-workspace';
import { connectedCatalog, mayEditConnectedMerchandising, mayEditConnectedTaxonomy, usesConnectedCatalog } from '@/lib/connected-catalog';
import type { CatalogRead } from '@/lib/connected-catalog-contract';
import { taxonomyHref, type CategoryData } from '@/lib/connected-category-data';
import { columnText, loadResource, param, type Query } from '@/lib/data';
import { pinnedAdminGatewayConfigured } from '@/lib/pinned-admin-gateway';
import { scopedCatalogPilotRequested, verifyScopedCatalogFence } from '@/lib/scoped-catalog-pilot';
import { ProductionCategories, ProductionCategoryEditor } from './production-categories';
import { ProductionBrandEditor, ProductionFaqEditor, ProductionRegistryDetail, ProductionRegistryList,
  type RegistryProduct, type RegistryRow } from './production-catalog-registry';
import { adminPath } from '@/lib/paths';
import { has, resources, type Region, type Resource } from '@/lib/sections';
import { CatalogConfirm, CatalogEditForm } from './catalog-edit-form';
import { CategoryManager } from './category-manager';
import { ConnectedCategories, type TaxonomyView } from './connected-categories';
import { PageHeading } from './dashboard';
import { MarketForm } from './market-form';
import { OperationActions } from './operation-actions';
import { ProductCatalog } from './product-catalog';
import { ProductEditForm, ProductionProductUpdate, type VariantDraft } from './product-edit-form';
import { ProductThumbnail } from './product-thumbnail';
import { ProductionCountries, ProductionCountryEditor, ProductionCountryMissing, type Country } from './production-countries';
import { ProductionProductDetail } from './production-product-detail';
import { ProductionReturnPolicies, ProductionReturnPolicyEditor, type ReturnPolicy } from './production-return-policies';
import { StorefrontEditor, type StorefrontSettings } from './storefront-editor';
import { Badge, Table } from './tables';
import { ConnectedProductWorkspace } from './connected-catalog-product/workspace';
import { productPath } from './connected-catalog-product/routes';
import catalogStyles from './production-catalog.module.css';
import productEditorStyles from './production-product-editor.module.css';
import { WorkspaceHeading } from './workspace-screen';

type Props = { auth: Session; q: Query; region: Region; id?: string; production?: boolean };
const availability = ['active', 'pending', 'inactive'];
const reviewStatuses = ['pending', 'approved', 'rejected'];
const fields = ['category', 'subcategory', 'sub_subcategory', 'third_subcategory'];
const asInput = (value: unknown): string => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
const asLines = (value: unknown) => arr(value).map(str).join('\n');
const columns = (data: Record<string,string>) => Object.entries(data).map(([label, fields]) => ({ label, fields }));

function RecoveredCategories({ nodes, selected, subcategory, ambiguous }: {
  nodes: CategoryNode[]; selected?: CategoryNode; subcategory: boolean; ambiguous?: boolean;
}) {
  return <div className={catalogStyles.page}>
    <div className={catalogStyles.header}><div><h1>Recovered category records</h1><p>Read-only Bangladesh catalog reference</p></div>
      <Link className={catalogStyles.outline} href={taxonomyHref('BD')}>Back to connected categories</Link>
    </div>
    {ambiguous && <p role="status">Several recovered categories use this slug. Choose a record by its recovered ID.</p>}
    {selected && <section><h2>{categoryName(selected)}</h2>
      <dl><dt>Recovered ID</dt><dd><code>{selected.id}</code></dd><dt>Legacy slug</dt><dd>{selected.slug}</dd>
        {selected.name_bn && <><dt>Bangla name</dt><dd lang="bn">{selected.name_bn}</dd></>}
        {selected.description_en && <><dt>English description</dt><dd>{selected.description_en}</dd></>}
        {selected.description_bn && <><dt>Bangla description</dt><dd lang="bn">{selected.description_bn}</dd></>}
      </dl>
    </section>}
    {!selected && <div className={catalogStyles.headerActions}>
      <Link className={catalogStyles.outline} href={taxonomyHref('BD', { catalog: 'legacy' })}>Main categories</Link>
      <Link className={catalogStyles.outline} href="/dashboard/sub-categories?catalog=legacy">Subcategories</Link>
    </div>}
    <ProductionCategories nodes={nodes} subcategory={selected ? selected.depth > 0 : subcategory} canCreate={false} canEdit={false} canDelete={false} recovered/>
  </div>;
}

export async function CategoryWorkspace({ auth, q, region, production, subcategory = false }: Props & { subcategory?: boolean }) {
  const lane = param(q, 'connectedOrganization') === '1' ? 'connected' : param(q, 'catalog');
  if (usesConnectedCatalog(lane)) {
    const pilot = scopedCatalogPilotRequested();
    const requested = (param(q, 'record') ?? param(q, 'category'))?.normalize('NFC');
    const mode = param(q, 'mode');
    const requestedView = param(q, 'view');
    const view: TaxonomyView = requestedView === 'attributes' || requestedView === 'menus' || requestedView === 'collections' ? requestedView : 'categories';
    const organizationView = view === 'menus' || view === 'collections';
    const rawScope = param(q, 'scope');
    const scope = rawScope === 'direct' || rawScope === 'descendants' || rawScope === 'search' ? rawScope : 'all';
    const rawPage = Number(param(q, 'page'));
    const page = Number.isSafeInteger(rawPage) && rawPage >= 1 && rawPage <= 10000 ? rawPage : undefined;
    const id = requested && /^[\p{L}\p{N}][\p{L}\p{M}\p{N}_-]{0,119}$/u.test(requested) ? requested : undefined;
    const query = param(q, 'q')?.trim().slice(0, 120);
    const menuKey = param(q, 'menuKey');
    const locale = param(q, 'menuLocale');
    const collectionId = param(q, 'collection');
    const read: CatalogRead = { read: 'categories', id, q: query, scope, page,
      menuKey: menuKey && /^[a-z0-9][a-z0-9-]{0,79}$/.test(menuKey) ? menuKey : undefined,
      locale: locale && /^[A-Za-z0-9-]{1,35}$/.test(locale) ? locale : undefined,
      collectionId: collectionId && /^[a-z0-9][a-z0-9-]{0,79}$/.test(collectionId) ? collectionId : undefined };
    let data = await connectedCatalog<CategoryData>(auth, region, read);
    if (region === 'BD' && view === 'categories' &&
        (param(q, 'catalog') === 'legacy' || (mode === 'edit' && requested))) {
      const { nodes } = await loadCategories(auth);
      const recoveredId = requested && mongoId(requested) ? requested.toLowerCase() : undefined;
      const byId = nodes.find(node => node.id === recoveredId);
      const bySlug = byId ? [] : nodes.filter(node => node.slug === requested &&
        (mode !== 'edit' || (subcategory ? node.depth > 0 : node.depth === 0)));
      if (bySlug.length > 1) return <RecoveredCategories nodes={nodes} subcategory={subcategory} ambiguous/>;
      const selected = byId ?? (bySlug.length === 1 ? bySlug[0] : undefined);
      if (selected && selected.id !== id) data = await connectedCatalog<CategoryData>(auth, region, { ...read, id: selected.id });
      if (!data.selectedId && (selected || !requested)) {
        return <RecoveredCategories nodes={nodes} selected={selected} subcategory={subcategory}/>;
      }
    }
    const selectedId = data.selectedId ?? requested;
    const catalogEdits = !pilot || (region === 'BD' && !organizationView && Boolean(selectedId && data.pilotCategoryIds?.includes(selectedId)));
    return <ConnectedCategories data={pilot ? { ...data, uploadEnabled: false } : data}
      region={region} view={view} requested={requested} query={query} pilot={pilot}
      mode={mode} assignmentScope={scope} childrenOnly={subcategory} permissions={{
        create: !pilot && data.owner && canChangeCategories(auth, 'product.create'),
        update: catalogEdits && data.owner && mayEditConnectedTaxonomy(auth),
        archive: catalogEdits && data.owner && canChangeCategories(auth, 'product.delete'),
        merchandise: catalogEdits && mayEditConnectedMerchandising(auth),
      }}/>;
  }
  const data = await loadCategories(auth);
  const ref = param(q, 'record');
  const initial = ref && data.nodes.find(row => row.id === ref || row.slug === ref)?.id;
  const mode = param(q, 'mode');
  if (scopedCatalogPilotRequested() && mode === 'edit' && ref) {
    const matches = data.nodes.filter(row => (subcategory ? row.depth > 0 : row.depth === 0) &&
      (row.id === ref || row.slug === ref));
    if (matches.length > 1) return <RecoveredCategories nodes={data.nodes} subcategory={subcategory} ambiguous/>;
    if (matches[0] && await verifyScopedCatalogFence(auth, { kind: 'category', id: matches[0].id })) {
      redirect(taxonomyHref(region, { record: matches[0].id }));
    }
  }
  if (production) {
    const canCreate = data.managed && canChangeCategories(auth, 'product.create');
    const canEdit = data.managed && canChangeCategories(auth, 'product.update');
    if (mode === 'create' || mode === 'create-child' || mode === 'edit') {
      if (mode === 'edit' ? !canEdit : !canCreate) throw new ApiError(403);
      const node = mode === 'edit' ? data.nodes.find(row => (subcategory ? row.depth > 0 : row.depth === 0)
        && (row.id === ref || row.slug === ref)) : undefined;
      if (mode === 'edit' && !node) throw new ApiError(404);
      return <ProductionCategoryEditor node={node} nodes={data.nodes} subcategory={subcategory} gateway={pinnedAdminGatewayConfigured()}/>;
    }
    return <ProductionCategories nodes={data.nodes} subcategory={subcategory} canCreate={canCreate}
      canEdit={canEdit} canDelete={data.managed && canChangeCategories(auth, 'product.delete')}/>;
  }
  return <>
    {!data.managed && <p className="notice" role="status">Category editing is unavailable on this API. The current tree remains available for browsing.</p>}
    <CategoryManager key={(initial ?? 'tree') + '-' + (mode ?? '')} nodes={data.nodes} initial={initial} mode={mode}
      canCreate={data.managed && canChangeCategories(auth, 'product.create')} canEdit={data.managed && canChangeCategories(auth, 'product.update')}
      canDelete={data.managed && canChangeCategories(auth, 'product.delete')}/>
  </>;
}

function variantDrafts(value: unknown, canSeeCost: boolean, sort = false): VariantDraft[] {
  const visiblePrices = (record: RecordData) => Object.fromEntries(['regular_price', 'sale_price', ...(canSeeCost ? ['buying_price'] : [])]
    .map(field => [field, asInput(record[field])]));
  const records = arr(value).map(obj).filter(variant => mongoId(reference(variant)));
  const serial = (row: RecordData) => typeof row.serial === 'number' ? row.serial : Number.MAX_SAFE_INTEGER;
  if (sort) records.sort((left, right) => serial(left) - serial(right));
  return records.map(variant => ({ key: reference(variant), _id: reference(variant),
    sku: str(variant.sku), attribute_values: Object.fromEntries(Object.entries(obj(variant.attribute_values)).map(([key,val]) => [key, asInput(val)])),
    base: visiblePrices(variant), prices: Object.fromEntries(currencies.map(currency => [currency, visiblePrices(obj(obj(variant.prices)[currency]))])),
    image: str(variant.image), images: asLines(variant.images), videos: asLines(variant.videos), color_code: str(variant.color_code),
    barcode: str(variant.barcode), color_image: str(variant.color_image), image_based_on: str(variant.image_based_on),
  }));
}
function inputValue(record: RecordData, field: string) {
  if (field === 'short_videos') return arr(record.short_videos).map(clip => str(obj(clip).url)).filter(Boolean).join('\n');
  if (['dynamic_specs', 'product_specifications', 'product_card_properties'].includes(field)) return JSON.stringify(arr(record[field]), null, 2);
  if (['facebook', 'instagram', 'youtube', 'tiktok'].includes(field)) return asInput(obj(record.social_links)[field]);
  if (['website', 'pos'].includes(field)) return asInput(obj(record.sale_channels)[field]) || (field === 'website' ? 'true' : 'false');
  if (Array.isArray(record[field])) return asLines(record[field]);
  return asInput(record[field]);
}
export async function ProductWorkspace({ auth, q, region, id, production }: Props) {
  if (usesConnectedCatalog(param(q, 'catalog'))) return ConnectedProductWorkspace({ auth, q, region, id });
  if (!id) return ProductCatalog({ auth, q, region, production });
  const lookupSlug = param(q, 'lookup') === 'slug' && !(production && mongoId(id));
  const creating = id === 'new' && !lookupSlug;
  const readId = !creating && (lookupSlug || !mongoId(id)) ? await productIdForSlug(id, auth, region) : id;
  if (!readId) throw new ApiError(404);
  if (creating && !canEditProduct('create', auth)) throw new ApiError(403);
  const record = creating ? {} : await readProduct(readId, auth, region);
  if (!creating && scopedCatalogPilotRequested() && await verifyScopedCatalogFence(auth, { kind: 'product', id: readId })) {
    redirect(productPath(readId, region));
  }
  const mode = param(q, 'mode');
  const editing = creating || mode === 'edit';
  const variantsOnly = mode === 'variants';
  const mayEdit = canEditProduct('edit', auth);
  const maySeeCost = has(auth.staff, 'purchase.price.view');
  const mayDelete = canEditProduct('delete', auth);
  const canViewStock = has(auth.staff, 'stock.view');
  const market = region === 'INTERNATIONAL' ? 'International' : 'Bangladesh';
  const filters = catalogFilters(q, canViewStock, canViewStock && has(auth.staff, 'business_locations.view'), production);
  const listParams = catalogParams(filters, region);
  const current = url(catalogPath + '/' + readId, listParams);
  const back = url(catalogPath, listParams);
  if (!creating && (editing || variantsOnly) && !mayEdit) throw new ApiError(403);
  const title = creating ? 'Create product' : (editing ? 'Edit product' : variantsOnly ? 'Edit variants' : str(record.name) || 'Product details');
  if (editing || variantsOnly) {
    const [tree, brands, policies, countries] = await Promise.all([
      variantsOnly ? [] : loadCategoryTree(auth), variantsOnly ? [] : productBrandOptions(auth, record.brand),
      variantsOnly ? [] : registryOptions('/return-policy', 'data', auth),
      variantsOnly || !production && region !== 'INTERNATIONAL' ? [] : registryOptions('/country/admin/all', 'countries', auth),
    ]);
    const initial = creating ? {} : Object.fromEntries([
      ...productFields.map(({name}) => [name, inputValue(record, name)]), ...['brand', 'return_policy'].map(field => [field, reference(record[field])]),
      ['available_countries', arr(record.available_countries).map(reference).filter(mongoId).join('\n')],
      ['short_video_details', JSON.stringify(arr(record.short_videos))],
    ]);
    const drafts = variantDrafts(record.variants, maySeeCost, production);
    const attributes = [...new Set([...arr(record.attributes).map(str), ...drafts.flatMap(row => Object.keys(row.attribute_values))].filter(Boolean))];
    if (production) {
      const target = creating ? undefined : readId;
      const listQuery = back.slice(catalogPath.length);
      const Form = creating || variantsOnly ? ProductEditForm : ProductionProductUpdate;
      return <div className={productEditorStyles.editor} data-update={!creating && !variantsOnly}>
        <WorkspaceHeading title={creating ? 'Create Product' : variantsOnly ? 'Update Product Attribute & Variant' : 'Update Product'}
          detail={str(record.name) ? `${market} catalog · ${str(record.name)}` : `${market} catalog`}>
          <Link className={productEditorStyles.back} href={url('/dashboard/products', listParams)}>
            <ChevronLeft size={16} aria-hidden="true"/> Back to products
          </Link>
        </WorkspaceHeading>
        <Form key={title + readId} production changeRegion={has(auth.staff, 'international.access')} id={target} region={region}
          tree={tree} initial={initial} brands={brands} policies={policies} countries={countries} selected={fields.map(key => reference(record[key]))}
          allowCost={maySeeCost} canDelete={mayDelete} initialAttributes={attributes} initialVariants={drafts} variantOnly={variantsOnly} productListQuery={listQuery}/>

      </div>;
    }
    return <><PageHeading eyebrow="COMMERCE / CATALOG" title={title} description={str(record.name) || 'Set up a listing in the selected market.'}/>
      <div className="page-actions"><Link className="button secondary" href={creating ? back : current}>{creating ? 'Back to all products' : 'Product details'}</Link></div>
      <section className="panel padded"><ProductEditForm key={title + readId} id={creating ? undefined : readId} region={region} tree={tree}
        initial={initial} brands={brands} policies={policies} countries={countries} selected={fields.map(key => reference(record[key]))}
        allowCost={maySeeCost} canDelete={mayDelete} initialAttributes={attributes} initialVariants={drafts}
        variantOnly={variantsOnly} productListQuery={back.slice(catalogPath.length)}/></section>
    </>;
  }
  if (production) return <ProductionProductDetail record={record} canSeeStock={canViewStock} market={market}
    listHref={url('/dashboard/products', listParams)}
    editHref={mayEdit ? url('/dashboard/update-product/' + readId, listParams) : undefined}/>;
  const storefront = process.env.GRIIP_ADMIN_INTEGRATED === '1' && mayEdit
    ? await api('/storefront/admin/product/' + readId, auth.token) as StorefrontSettings : undefined;
  const variants = arr(record.variants).map(obj).filter(variant => mongoId(reference(variant)));
  const variantColumns = columns({ SKU: 'sku', 'Regular price': 'regular_price', 'Sale price': 'sale_price', Barcode: 'barcode' });
  const branches = fields.map(key => str(obj(record[key]).name_en) || str(obj(record[key]).name)).filter(Boolean);
  const edit = (mode: string) => url(catalogPath + '/' + readId, { ...listParams, mode });
  return <><PageHeading eyebrow="COMMERCE / CATALOG" title={title} description={str(record.sku)}/>
    <div className="page-actions"><Link className="button secondary" href={back}>Back to all products</Link>
      {mayEdit && <><Link className="button primary" href={edit('edit')}>Edit product</Link><Link className="button secondary" href={edit('variants')}>Edit variants</Link></>}
      {canViewStock && <Link className="button secondary" href={url('/desk/inventory/stock', { region, product: readId, location: filters.location })}>View stock</Link>}
      <OperationActions endpoint="/product/admin/all" auth={auth} region={region} record={record} id={readId}/>
      {mayDelete && <CatalogConfirm kind="products" id={readId} region={region} action="delete" label="Delete product" finish={back}
        description="Delete this product and its listing. Review its stock and referenced records before confirming."/>}
    </div>
    <section className="panel padded product-record-copy"><div className="page-actions"><ProductThumbnail source={record.thumbnail} size={72}/><Badge value={record.is_published ? 'Published' : 'Unpublished'}/></div>
      <h2>Product details</h2><p>{str(record.description).replace(/<[^>]+>/g, ' ').trim() || 'No product description.'}</p>
      <dl className="details-grid">{[
        ['Category', branches.join(' / ')], ['SKU', str(record.sku)], ['Slug', str(record.slug)], ['Brand', str(obj(record.brand).name)],
        ['Warranty', str(record.warranty)], ['Delivery', str(record.approximately_delivery_time)], ['Return policy', str(obj(record.return_policy).title)],
        ['Sales channels', Object.entries(obj(record.sale_channels)).filter(([,v]) => v === true).map(([key]) => key).join(', ')],
        ['Search tags', arr(record.search_tags).map(str).join(', ')], ['Available countries', arr(record.available_countries).map(value => str(obj(value).name) || str(obj(value).code)).filter(Boolean).join(', ')],
      ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value || '—'}</dd></div>)}</dl>
    </section>
    {storefront && <StorefrontEditor id={readId} settings={storefront}/>}
    <Table columns={variantColumns} rows={variants.map(row => ({ id: reference(row), values: variantColumns.map(column => columnText(row, column)),
      href: url('/desk/catalog/variants/' + reference(row), { region }) }))} title="Product variants"/>
  </>;
}
async function productIdForSlug(slug: string, auth: Session, region: Region) {
  if (!has(auth.staff, 'product.view') || !/^[a-z0-9_-]{1,160}$/i.test(slug)) throw new ApiError(404);
  const result = obj(await api(url('/product/admin/all', { slug, region, limit: '2' }), auth.token));
  const matches = arr(result.data).map(obj).filter(row => row.slug === slug && (str(row.region) || 'BD') === region);
  const id = matches.length === 1 ? reference(matches[0]) : '';
  return mongoId(id) ? id : undefined;
}

const registryResources = {
  brands: () => ({ ...resources.catalog.brands, search: 'searchTerm',
    filter: { label: 'Status', key: 'is_active', options: ['true', 'false'] } }),
  faqs: () => ({ ...resources.catalog.faqs, search: 'search', filter: { label: 'Status', key: 'status', options: availability },
    columns: [{ label: 'Question', fields: 'question' }, { label: 'Product', fields: 'product.name' }, { label: 'Status', fields: 'status', kind: 'badge' as const }] }),
  reviews: () => ({ ...resources.catalog.reviews, filter: { label: 'Status', key: 'status', options: reviewStatuses } }),
  policies: () => ({ ...resources.catalog.policies, search: 'search', filter: { label: 'Status', key: 'is_active', options: ['true', 'false'] },
    columns: [{ label: 'Policy', fields: 'title' }, { label: 'Days', fields: 'return_period_days' }, { label: 'Status', fields: 'is_active', kind: 'badge' as const }] }),
  countries: () => ({ ...resources.markets.countries, search: 'searchTerm' }),
} satisfies Record<Registry, () => Resource>;
const sameRegion = (row: RecordData, region: Region) => (str(obj(row.product).region) || 'BD') === region && mongoId(reference(row.product));
const registryPath = (kind: Registry) => '/desk/' + (kind === 'countries' ? 'markets' : 'catalog') + '/' + kind;

function countryRecord(row: RecordData): Country {
  return {
    id: reference(row), name: str(row.name), code: str(row.code), currency: str(row.currency),
    currencySymbol: str(row.currency_symbol), flag: str(row.flag_emoji), active: row.is_active === true,
    serial: typeof row.serial === 'number' && Number.isSafeInteger(row.serial) ? row.serial : undefined,
  };
}

async function countriesWorkspace(auth: Session, region: Region, id?: string) {
  if (!has(auth.staff, 'product.view')) throw new ApiError(403);
  const create = canEditRegistry('countries', 'create', auth) && has(auth.staff, 'product.create');
  const edit = canEditRegistry('countries', 'edit', auth) && has(auth.staff, 'product.update');
  if (id) {
    if (id === 'new' ? !create : !edit) throw new ApiError(403);
    try {
      const country = id !== 'new' ? countryRecord(await readRegistry('countries', id, auth, region)) : undefined;
      return <ProductionCountryEditor country={country} key={id} region={region}/>;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return <ProductionCountryMissing/>;
      throw error;
    }
  }
  const payload = obj(await api('/country/admin/all?page=1&limit=200', auth.token));
  const rows = arr(payload.countries).map(obj).map(countryRecord).filter(row => mongoId(row.id));
  return <ProductionCountries rows={rows} region={region} canCreate={create} canEdit={edit}
    canDelete={canEditRegistry('countries', 'delete', auth)}/>;
}

function registryProduct(row: RecordData): RegistryProduct {
  return { name: str(row.name), slug: str(row.slug), sku: str(row.sku), image: str(row.thumbnail) };
}

async function productBrandOptions(auth: Session, current: unknown) {
  const data = obj(await api('/brand/admin/all?limit=250&is_active=true', auth.token));
  const choices = arr(data.brands).map(obj).filter(row => mongoId(reference(row))).map(row => {
    const name = str(row.name);
    const bangla = str(row.name_bn);
    return { value: reference(row), label: bangla && bangla !== name ? name + ' · ' + bangla : name, code: '' };
  });
  const selected = reference(current);
  if (mongoId(selected) && !choices.some(choice => choice.value === selected)) {
    const label = str(obj(current).name) || 'Existing brand';
    choices.push({ value: selected, label, code: '' });
  }
  return choices;
}

function registryRow(row: RecordData): RegistryRow {
  return {
    id: reference(row), name: str(row.name), nameBn: str(row.name_bn), tags: [...new Set(arr(row.tags).map(str).filter(Boolean))], product: registryProduct(obj(row.product)),
    status: str(row.status) || (row.is_active === false ? 'inactive' : 'active'), question: str(row.question), answer: str(row.answer),
    creator: str(obj(row.createdBy).full_name) || str(obj(row.user).full_name) || str(obj(row.customer).full_name), created: str(row.createdAt),
    updated: str(row.updatedAt), rating: Number(row.rating) || 0, title: str(row.title), content: str(row.content),
    media: arr(row.media).map(value => ({url:str(obj(value).url),type:str(obj(value).type)})), attachments: arr(row.storefrontMediaTypes).map(str),
    upvotes: Number(row.upvotes ?? obj(row.helpfulVotes).upvotes) || 0,
    downvotes: Number(row.downvotes ?? obj(row.helpfulVotes).downvotes) || 0, reply: str(obj(row.sellerReply).content),
    repliedAt: str(obj(row.sellerReply).repliedAt),
  };
}

function returnPolicy(row: RecordData): ReturnPolicy {
  return { id: reference(row), title: str(row.title), description: str(row.description), days: asInput(row.return_period_days),
    active: row.is_active === true, conditions: arr(row.conditions).map(str).filter(Boolean) };
}

export async function CatalogRegistry({ auth, q, region, id, kind, production }: Props & { kind: Registry }): Promise<ReactElement> {
  if (production && kind === 'countries') return countriesWorkspace(auth, region, id);
  const resource = registryResources[kind]();
  if (!has(auth.staff, resource.permission)) throw new ApiError(403);
  const create = kind !== 'reviews' && canEditRegistry(kind, 'create', auth);
  const base = registryPath(kind);
  const back = url(base, { region });
  if (id) {
    const creating = id === 'new';
    if (creating && !create) throw new ApiError(403);
    if (kind === 'faqs' && !creating && !mongoId(id)) {
      if (production) {
        const product = await productIdForSlug(id, auth, region);
        if (!product) throw new ApiError(404);
        const options = await loadResource({ ...resource, params: { product } }, auth, {}, region);
        const row = options.rows.find(row => sameRegion(row, region) && mongoId(reference(row)));
        if (!row) throw new ApiError(404);
        return <ProductionRegistryDetail row={registryRow(row)} kind="faqs" region={region}
          canEdit={canEditRegistry('faqs', 'edit', auth)} showAttachments={false}/>;
      }
      return FaqProduct({auth, q, region, id});
    }
    const entry = creating ? {} : await readRegistry(kind, id, auth, region);
    const label = registries[kind].title;
    const canEdit = creating || canEditRegistry(kind, 'edit', auth);
    const canDelete = !creating && canEditRegistry(kind, 'delete', auth);
    if (production && kind === 'brands') {
      if (!canEdit) throw new ApiError(403);
      return <ProductionBrandEditor brand={creating ? undefined : registryRow(entry)} region={region}/>;
    }
    if (production && kind === 'policies') {
      if (!canEdit) throw new ApiError(403);
      return <ProductionReturnPolicyEditor policy={creating ? undefined : returnPolicy(entry)} region={region}/>;
    }
    if (production && kind === 'faqs' && creating) {
      const ref = param(q, 'product');
      const product = ref && mongoId(ref) ? await readProduct(ref, auth, region) : undefined;
      return <ProductionFaqEditor region={region} chosenProduct={product ? { id: reference(product), product: registryProduct(product) } : undefined}/>;
    }
    if (production && (kind === 'faqs' || kind === 'reviews')) {
      return <ProductionRegistryDetail row={registryRow(entry)} region={region} kind={kind} canEdit={canEdit}
        showAttachments={process.env.GRIIP_ADMIN_INTEGRATED === '1' && canWrite(auth.staff)}/>;
    }
    const fields = registries[kind].fields.filter(field => kind !== 'faqs' || creating || field.name !== 'product').map(field =>
      kind === 'faqs' && !creating && field.name === 'answer' ? { ...field, required: false } : field);
    const initial = Object.fromEntries(fields.map(({name}) => [name, Array.isArray(entry[name]) ? asLines(entry[name]) : asInput(entry[name])]).filter(([,value]) => value !== ''));
    const selectedProduct = obj(entry.product);
    const productSearch = creating && kind === 'faqs' ? await chooseProduct(auth, q, region, base + '/new') : undefined;
    return <><PageHeading eyebrow={kind === 'countries' ? 'OPERATIONS / MARKETS' : 'COMMERCE / CATALOG'}
      title={creating ? 'Create ' + label.toLowerCase() : str(entry.name) || str(entry.title) || str(entry.question) || label}
      description={creating ? '' : str(selectedProduct.name) || str(entry.code)}/>
      <div className="page-actions"><Link className="button secondary" href={back}>Back to {resource.title.toLowerCase()}</Link>
        {kind === 'countries' && !creating && canEdit && <MarketForm id={id} name={str(entry.name)} code={str(entry.code)}
          currency={str(entry.currency)} active={entry.is_active === true}/>}
        {canDelete && <CatalogConfirm kind={kind} id={id} region={region} action="delete" label={'Delete ' + label.toLowerCase()} finish={back}
          description={'Confirm removal of this ' + label.toLowerCase() + '.'}/>}</div>
      {kind === 'countries' && !creating && <section className="panel padded"><h2>Market settings</h2>
        <dl className="details-grid"><div><dt>Currency</dt><dd>{str(entry.currency)}</dd></div>
          <div><dt>Country status</dt><dd>{entry.is_active === true ? 'Active' : 'Inactive'}</dd></div></dl>
      </section>}
      {productSearch?.searchForm}
      {canEdit && (kind !== 'faqs' || !creating || productSearch?.selected) && <section className="panel padded"><h2>{creating ? 'New' : 'Edit'} {label.toLowerCase()}</h2>
        <CatalogEditForm kind={kind} id={creating ? undefined : id} region={region} fields={fields.filter(field => field.name !== 'product')} initial={initial}
          label={creating ? 'Create ' + label.toLowerCase() : 'Save changes'} finish={creating ? url(base + '/:id', { region }) : undefined}>
          {productSearch?.selected && <><p>Product: {str(productSearch.selected.name)}</p><input type="hidden" name="product" value={reference(productSearch.selected)}/></>}
        </CatalogEditForm></section>}
      {!canEdit && <section className="panel padded"><dl className="details-grid">{fields.map(field => <div key={field.name}><dt>{field.label}</dt>
        <dd>{initial[field.name] || '—'}</dd></div>)}</dl></section>}
      {kind === 'reviews' && !creating && <>
        <section className="panel padded"><h2>Review moderation</h2><Badge value={str(entry.status) || 'pending'}/>
          {!!arr(entry.media).length && <ul>{arr(entry.media).map((item,index) => {
            const source = str(obj(item).url);
            return /^https?:\/\//i.test(source) ? <li key={index}><a href={source} target="_blank" rel="noreferrer">{str(obj(item).type) || 'Media'} {index + 1}</a></li> : null;
          })}</ul>}
          {process.env.GRIIP_ADMIN_INTEGRATED === '1' && canWrite(auth.staff) && <div className="review-moderation-media">
            {arr(entry.storefrontMediaTypes).map((type, index) => {
              const src = adminPath('/api/storefront?' + new URLSearchParams({ id, index: String(index), region }));
              // eslint-disable-next-line @next/next/no-img-element
              return type === 'video/mp4' ? <video key={src} src={src} controls preload="metadata"/> : <img key={src} src={src} alt={'Review attachment ' + (index + 1)}/>;
            })}
          </div>}
          {canEdit && <CatalogEditForm kind={kind} id={id} action="status" region={region} label="Save review status"
            fields={[{ name: 'status', label: 'Review status', kind: 'choice', choices: statusOptions(reviewStatuses), required: true }]}
            initial={{ status: str(entry.status) || 'pending' }}/>}</section>
        <section className="panel padded"><h2>Seller reply</h2>{str(obj(entry.sellerReply).content) && <p>{str(obj(entry.sellerReply).content)}</p>}
          {canEdit && <CatalogEditForm kind={kind} id={id} action="reply" region={region} label="Save reply"
            fields={[{ name: 'content', label: 'Reply', kind: 'long', max: 2000, required: true }]}
            initial={{ content: str(obj(entry.sellerReply).content) }}/>}</section>
      </>}
    </>;
  }
  const productId = param(q, 'product');
  const rating = param(q, 'rating');
  const scoped = kind === 'faqs' || kind === 'reviews';
  if (scoped && productId && !mongoId(productId)) throw new ApiError(404);
  const rowResource = scoped ? { ...resource, params: { ...(productId ? { product: productId } : {}), ...(kind === 'reviews' && rating && /^[1-5]$/.test(rating) ? { rating } : {}) } } : resource;
  const requestedLimit = param(q, 'limit') ?? '';
  const allowedLimits = ['20','40','60','80','100', ...(kind === 'faqs' ? ['all'] : [])];
  const limit = production && scoped && allowedLimits.includes(requestedLimit) ? requestedLimit : '20';
  const all = limit === 'all';
  const pageSize = all ? 10000 : Number(limit);
  const list = await loadResource(rowResource, auth, all ? { ...q, page: '1' } : q, region, pageSize);
  const search = param(q, 'q');
  const filter = param(q, 'filter');
  const page = (value: number) => url(base, { region, filter, q: search, product: productId, rating, page: String(value) });
  const filtered = kind === 'faqs' ? list.rows.filter(row => sameRegion(row, region)) : list.rows;
  if (production && kind === 'policies') return <ProductionReturnPolicies policies={filtered.filter(row => mongoId(reference(row))).map(returnPolicy)}
    region={region} canCreate={create} canEdit={canEditRegistry('policies', 'edit', auth)} canDelete={canEditRegistry('policies', 'delete', auth)}/>;
  if (production && (kind === 'brands' || kind === 'faqs' || kind === 'reviews')) return <ProductionRegistryList
    rows={filtered.filter(row => mongoId(reference(row))).map(registryRow)} kind={kind} region={region}
    page={list.page} limit={limit} pageSize={pageSize} hasNext={!all && list.hasNext} total={kind === 'faqs' && !productId ? undefined : list.total} search={search} filter={filter} product={productId}
    rating={rating} canCreate={create} canEdit={canEditRegistry(kind, 'edit', auth)} canDelete={canEditRegistry(kind, 'delete', auth)}/>;
  const rows = filtered.filter(row => mongoId(reference(row))).map(row => ({ id: reference(row), values: resource.columns.map(column => columnText(row, column)), href: url(base + '/' + reference(row), { region }) }));
  return <><PageHeading eyebrow={kind === 'countries' ? 'OPERATIONS / MARKETS' : 'COMMERCE / CATALOG'} title={resource.title} description=""/>
    <div className="page-actions">{create && <Link className="button primary" href={url(base + '/new', { region, product: productId })}>Create {registries[kind].title.toLowerCase()}</Link>}
      {kind === 'countries' && create && <CatalogConfirm kind={kind} region={region} action="seed" label="Seed starter countries"
        description="Add the starter country records missing from this workspace."/>}</div>
    <form className="panel filters" action={adminPath(base)}><input type="hidden" name="region" value={region}/>
      <label className="search-input"><input name="q" defaultValue={search} aria-label={'Search ' + resource.title.toLowerCase()} placeholder="Search"/></label>
      {kind === 'reviews' && <label>Rating<select name="rating" defaultValue={rating ?? ''}><option value="">All ratings</option>
        {[1,2,3,4,5].map(value => <option key={value} value={value}>{value} stars</option>)}</select></label>}
      {productId && <input type="hidden" name="product" value={productId}/>}
      {resource.filter && <label>{resource.filter.label}<select name="filter" defaultValue={filter ?? ''}><option value="">All statuses</option>
        {resource.filter.options.map(value => <option key={value} value={value}>{value === 'true' ? 'Active' : value === 'false' ? 'Inactive' : value}</option>)}</select></label>}
      <button className="button primary">Apply</button><Link className="button subtle" href={back}>Reset</Link></form>
    <Table title={resource.title} columns={resource.columns} rows={rows} page={list.page} total={scoped ? undefined : list.total}
      previous={list.page > 1 ? page(list.page - 1) : undefined} next={list.hasNext ? page(list.page + 1) : undefined}/>
  </>;
}

async function chooseProduct(auth: Session, q: Query, region: Region, base: string) {
  const productId = param(q, 'product') ?? '';
  const selected = mongoId(productId) ? await readProduct(productId, auth, region) : undefined;
  const query = (param(q, 'productSearch') ?? '').trim().slice(0,80);
  const products = query ? obj(await api(url('/product/admin/all', {
    region, searchQuery: query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), limit: '20',
  }), auth.token)) : {};
  const list = arr(products.data).map(obj).filter(row => mongoId(reference(row)) && (str(row.region) || 'BD') === region);
  return { selected, searchForm: <section className="panel padded"><h2>Find a product</h2>
    <form className="filters" action={adminPath(base)}><input type="hidden" name="region" value={region}/><label className="search-input">
      <input name="productSearch" aria-label="Search products" defaultValue={query} placeholder="Search by name or SKU" required/></label><button className="button primary">Search products</button></form>
    {query && (list.length ? <ul>{list.map(row => <li key={reference(row)}><Link className="table-link" href={url(base, { region, product: reference(row) })}>
      {str(row.name) || str(row.sku)}</Link></li>)}</ul> : <p>No matching products.</p>)}
  </section> };
}
async function FaqProduct({ auth, q, region, id }: Props): Promise<ReactElement> {
  const record = id && await productIdForSlug(id, auth, region);
  if (!record) throw new ApiError(404);
  return CatalogRegistry({auth, q: { ...q, product: record }, region, kind: 'faqs'});
}
