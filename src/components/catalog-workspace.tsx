import Link from 'next/link';
import type { ReactElement } from 'react';
import { api, ApiError, arr, canWrite, mongoId, obj, str, url, type RecordData, type Session } from '@/lib/api';
import { reference } from '@/lib/advanced';
import { canEditProduct, canEditRegistry, readProduct, readRegistry, registryOptions } from '@/lib/catalog-admin';
import { currencies, productFields, registries, statusOptions, type Registry } from '@/lib/catalog-edit-fields';
import { catalogFilters, catalogParams, catalogPath, loadCategoryTree } from '@/lib/catalog-list';
import { canChangeCategories, loadCategories } from '@/lib/category-workspace';
import { columnText, loadResource, param, type Query } from '@/lib/data';
import { adminPath } from '@/lib/paths';
import { has, resources, type Region, type Resource } from '@/lib/sections';
import { CatalogConfirm, CatalogEditForm } from './catalog-edit-form';
import { CategoryManager } from './category-manager';
import { PageHeading } from './dashboard';
import { MarketForm } from './market-form';
import { OperationActions } from './operation-actions';
import { ProductCatalog } from './product-catalog';
import { ProductEditForm, type VariantDraft } from './product-edit-form';
import { ProductThumbnail } from './product-thumbnail';
import { StorefrontEditor, type StorefrontSettings } from './storefront-editor';
import { Badge, Table } from './tables';

type Props = { auth: Session; q: Query; region: Region; id?: string };
const availability = ['active', 'pending', 'inactive'];
const reviewStatuses = ['pending', 'approved', 'rejected'];
const fields = ['category', 'subcategory', 'sub_subcategory', 'third_subcategory'];
const asInput = (value: unknown): string => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
const asLines = (value: unknown) => arr(value).map(str).join('\n');
const columns = (data: Record<string,string>) => Object.entries(data).map(([label, fields]) => ({ label, fields }));

export async function CategoryWorkspace({ auth, q }: Props) {
  const data = await loadCategories(auth);
  const ref = param(q, 'record');
  const initial = ref && data.nodes.find(row => row.id === ref || row.slug === ref)?.id;
  const mode = param(q, 'mode');
  return <>
    {!data.managed && <p className="notice" role="status">Category editing is unavailable on this API. The current tree remains available for browsing.</p>}
    <CategoryManager key={(initial ?? 'tree') + '-' + (mode ?? '')} nodes={data.nodes} initial={initial} mode={mode}
      canCreate={data.managed && canChangeCategories(auth, 'product.create')} canEdit={data.managed && canChangeCategories(auth, 'product.update')}
      canDelete={data.managed && canChangeCategories(auth, 'product.delete')}/>
  </>;
}

function variantDrafts(value: unknown, canSeeCost: boolean): VariantDraft[] {
  const visiblePrices = (record: RecordData) => Object.fromEntries(['regular_price', 'sale_price', ...(canSeeCost ? ['buying_price'] : [])]
    .map(field => [field, asInput(record[field])]));
  return arr(value).map(obj).filter(variant => mongoId(reference(variant))).map(variant => ({ key: reference(variant), _id: reference(variant),
    sku: str(variant.sku), attribute_values: Object.fromEntries(Object.entries(obj(variant.attribute_values)).map(([key,val]) => [key, asInput(val)])),
    base: visiblePrices(variant), prices: Object.fromEntries(currencies.map(currency => [currency, visiblePrices(obj(obj(variant.prices)[currency]))])),
    image: str(variant.image), images: asLines(variant.images), videos: asLines(variant.videos), color_code: str(variant.color_code),
  }));
}
function inputValue(record: RecordData, field: string) {
  if (field === 'short_videos') return arr(record.short_videos).map(clip => str(obj(clip).url)).filter(Boolean).join('\n');
  if (field === 'dynamic_specs') return JSON.stringify(arr(record.dynamic_specs), null, 2);
  if (['facebook', 'instagram', 'youtube', 'tiktok'].includes(field)) return asInput(obj(record.social_links)[field]);
  if (['website', 'pos'].includes(field)) return asInput(obj(record.sale_channels)[field]) || (field === 'website' ? 'true' : 'false');
  if (Array.isArray(record[field])) return asLines(record[field]);
  return asInput(record[field]);
}
export async function ProductWorkspace({ auth, q, region, id }: Props) {
  if (!id) return ProductCatalog({ auth, q, region });
  const lookupSlug = param(q, 'lookup') === 'slug';
  const creating = id === 'new' && !lookupSlug;
  const readId = !creating && (lookupSlug || !mongoId(id)) ? await productIdForSlug(id, auth, region) : id;
  if (!readId) throw new ApiError(404);
  if (creating && !canEditProduct('create', auth)) throw new ApiError(403);
  const record = creating ? {} : await readProduct(readId, auth, region);
  const mode = param(q, 'mode');
  const editing = creating || mode === 'edit';
  const variantsOnly = mode === 'variants';
  const mayEdit = canEditProduct('edit', auth);
  const maySeeCost = has(auth.staff, 'purchase.price.view');
  const mayDelete = canEditProduct('delete', auth);
  const canViewStock = has(auth.staff, 'stock.view');
  const filters = catalogFilters(q, canViewStock, canViewStock && has(auth.staff, 'business_locations.view'));
  const listParams = catalogParams(filters, region);
  const current = url(catalogPath + '/' + readId, listParams);
  const back = url(catalogPath, listParams);
  if (!creating && (editing || variantsOnly) && !mayEdit) throw new ApiError(403);
  const title = creating ? 'Create product' : (editing ? 'Edit product' : variantsOnly ? 'Edit variants' : str(record.name) || 'Product details');
  if (editing || variantsOnly) {
    const [tree, brands, policies, countries, variantRecords] = await Promise.all([
      variantsOnly ? [] : loadCategoryTree(auth), variantsOnly ? [] : registryOptions('/brand/admin/all', 'brands', auth),
      variantsOnly ? [] : registryOptions('/return-policy', 'data', auth),
      variantsOnly || region !== 'INTERNATIONAL' ? [] : registryOptions('/country/admin/all', 'countries', auth),
      variantsOnly ? api('/product/variant/' + readId, auth.token) : [],
    ]);
    const initial = creating ? {} : Object.fromEntries([
      ...productFields.map(({name}) => [name, inputValue(record, name)]), ...['brand', 'return_policy'].map(field => [field, reference(record[field])]),
      ['available_countries', arr(record.available_countries).map(reference).filter(mongoId).join('\n')],
    ]);
    const drafts = variantDrafts(variantRecords, maySeeCost);
    const attributes = [...new Set([...arr(record.attributes).map(str), ...drafts.flatMap(row => Object.keys(row.attribute_values))].filter(Boolean))];
    return <><PageHeading eyebrow="COMMERCE / CATALOG" title={title} description={str(record.name) || 'Set up a listing in the selected market.'}/>
      <div className="page-actions"><Link className="button secondary" href={creating ? back : current}>{creating ? 'Back to all products' : 'Product details'}</Link></div>
      <section className="panel padded"><ProductEditForm key={title + readId} id={creating ? undefined : readId} region={region} tree={tree}
        initial={initial} brands={brands} policies={policies} countries={countries} selected={fields.map(key => reference(record[key]))}
        allowCost={maySeeCost} canDelete={mayDelete} initialAttributes={attributes} initialVariants={drafts}
        variantOnly={variantsOnly} productListQuery={back.slice(catalogPath.length)}/></section>
    </>;
  }
  const [storedVariants, storefront] = await Promise.all([
    api('/product/variant/' + readId, auth.token),
    process.env.GRIIP_ADMIN_INTEGRATED === '1' && mayEdit
      ? api('/storefront/admin/product/' + readId, auth.token) as Promise<StorefrontSettings> : undefined,
  ]);
  const variants = arr(storedVariants).map(obj).filter(variant => mongoId(reference(variant)));
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
  brands: () => ({ ...resources.catalog.brands, search: 'searchTerm' }),
  faqs: () => ({ ...resources.catalog.faqs, search: 'search', filter: { label: 'Status', key: 'status', options: availability },
    columns: [{ label: 'Question', fields: 'question' }, { label: 'Product', fields: 'product.name' }, { label: 'Status', fields: 'status', kind: 'badge' as const }] }),
  reviews: () => ({ ...resources.catalog.reviews, filter: { label: 'Status', key: 'status', options: reviewStatuses } }),
  policies: () => ({ ...resources.catalog.policies, search: 'search', filter: { label: 'Status', key: 'is_active', options: ['true', 'false'] },
    columns: [{ label: 'Policy', fields: 'title' }, { label: 'Days', fields: 'return_period_days' }, { label: 'Status', fields: 'is_active', kind: 'badge' as const }] }),
  countries: () => ({ ...resources.markets.countries, search: 'searchTerm' }),
} satisfies Record<Registry, () => Resource>;
const sameRegion = (row: RecordData, region: Region) => (str(obj(row.product).region) || 'BD') === region && mongoId(reference(row.product));
const registryPath = (kind: Registry) => '/desk/' + (kind === 'countries' ? 'markets' : 'catalog') + '/' + kind;

export async function CatalogRegistry({ auth, q, region, id, kind }: Props & { kind: Registry }): Promise<ReactElement> {
  const resource = registryResources[kind]();
  if (!has(auth.staff, resource.permission)) throw new ApiError(403);
  const create = kind !== 'reviews' && canEditRegistry(kind, 'create', auth);
  const base = registryPath(kind);
  const back = url(base, { region });
  if (id) {
    const creating = id === 'new';
    if (creating && !create) throw new ApiError(403);
    if (kind === 'faqs' && !creating && !mongoId(id)) return FaqProduct({auth, q, region, id});
    const entry = creating ? {} : await readRegistry(kind, id, auth, region);
    const label = registries[kind].title;
    const canEdit = creating || canEditRegistry(kind, 'edit', auth);
    const canDelete = !creating && canEditRegistry(kind, 'delete', auth);
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
              const src = adminPath('/api/storefront?id=' + id + '&index=' + index);
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
  const list = await loadResource(rowResource, auth, q, region);
  const search = param(q, 'q');
  const filter = param(q, 'filter');
  const page = (value: number) => url(base, { region, filter, q: search, product: productId, rating, page: String(value) });
  const filtered = scoped ? list.rows.filter(row => sameRegion(row, region)) : list.rows;
  const rows = filtered.filter(row => mongoId(reference(row))).map(row => ({ id: reference(row), values: resource.columns.map(column => columnText(row, column)), href: url(base + '/' + reference(row), { region }) }));
  return <><PageHeading eyebrow={kind === 'countries' ? 'OPERATIONS / MARKETS' : 'COMMERCE / CATALOG'} title={resource.title} description=""/>
    <div className="page-actions">{create && <Link className="button primary" href={url(base + '/new', { region, product: productId })}>Create {registries[kind].title.toLowerCase()}</Link>}
      {kind === 'countries' && create && <CatalogConfirm kind={kind} region={region} action="seed" label="Seed starter countries"
        description="Add the starter country records missing from this workspace."/>}</div>
    <form className="panel filters" action={adminPath(base)}><input type="hidden" name="region" value={region}/>
      {kind !== 'reviews' && <label className="search-input"><input name="q" defaultValue={search} aria-label={'Search ' + resource.title.toLowerCase()} placeholder="Search"/></label>}
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
