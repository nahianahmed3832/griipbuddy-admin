'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, Eye, Ticket } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { CategoryOption } from '@/lib/catalog-list';
import { adminPath } from '@/lib/paths';
import { couponPageSizes } from '@/lib/promotion-fields';
import type { Region } from '@/lib/sections';
import { ProductionCatalogActions } from './production-catalog-actions';
import { ProductEditorPanel, ProductEditorSwitch } from './production-product-editor-fields';
import { RegistryPageSize } from './production-registry-size';
import { PromotionResult, usePromotionSave } from './promotion-forms';
import styles from './production-catalog.module.css';
import editor from './production-product-editor.module.css';
import details from './production-catalog-details.module.css';
import design from './production-coupons.module.css';

const couponPath = '/dashboard/coupons';
export type CouponChoice = { id: string; label: string };
export type CouponSummary = { id: string; code: string; type: string; discount: string; used: number; active: boolean; expires: string };
const regionParams = (region: Region) => ({ region: region === 'INTERNATIONAL' ? region : undefined });
function scope(path: string, region: Region, mode?: string) {
  const params = new URLSearchParams();
  if (region === 'INTERNATIONAL') params.set('region', region);
  if (mode) params.set('mode', mode);
  return path + (params.size ? '?' + params : '');
}
const date = (value: string) => Number.isFinite(Date.parse(value))
  ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Asia/Dhaka' }).format(new Date(value)) : 'N/A';

export function ProductionCouponList({ rows, limit, total, page, hasNext, region, canCreate, canEdit, canDelete,
  listPath = couponPath, createPath = '/dashboard/create-coupon', query }: {
  rows: CouponSummary[]; limit: string; total: number; page: number; hasNext: boolean; region: Region;
  canCreate: boolean; canEdit: boolean; canDelete: boolean; listPath?: string; createPath?: string;
  query?: { q: string; filter: string };
}) {
  const router = useRouter();
  const { submit, pending, result } = usePromotionSave();
  const [deleteTarget, setDeleteTarget] = useState<CouponSummary>();
  const href = (number: number) => {
    const params = new URLSearchParams();
    if (number !== 1) params.set('page', String(number));
    if (limit !== '20') params.set('limit', limit);
    if (region === 'INTERNATIONAL') params.set('region', region);
    if (query?.q) params.set('q', query.q);
    if (query?.filter) params.set('filter', query.filter);
    return listPath + (params.size ? '?' + params : '');
  };
  return <section className={styles.page}>
    <header className={styles.header}><h1>All Coupons ({total})</h1>
      {canCreate && <Link className={styles.primary} href={scope(createPath, region)}>Create Coupon</Link>}
    </header>
    <PromotionResult result={result}/>
    {query && <form className="panel filters" action={adminPath(listPath)}>
      <input type="hidden" name="limit" value={limit}/>
      {region === 'INTERNATIONAL' && <input type="hidden" name="region" value={region}/>}
      <label>Coupon code<input type="search" name="q" maxLength={80} defaultValue={query.q}/></label>
      <label>Coupon status<select name="filter" defaultValue={query.filter}>
        <option value="">All</option><option value="true">Active</option><option value="false">Inactive</option>
      </select></label>
      <button className={styles.primary}>Apply filters</button>
      <Link className={styles.outline} href={scope(listPath, region)}>Clear filters</Link>
    </form>}
    <div className={design.list}><table className={styles.table}>
      <thead><tr>{['SL NO:', 'Code', 'Type', 'DiscountValue', 'Used', 'Status', 'Expire', 'Actions'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.id}>
        <td>{String(index + 1).padStart(2, '0')}</td>
        <td>{query ? <Link className="table-link" href={scope(listPath + '/' + row.id, region)}>{row.code}</Link> : row.code}</td>
        <td>{row.type}</td><td>{row.discount}</td><td>{row.used}</td>
        <td><span className={details.policyStatus}>
          {canEdit && <input className={details.policyToggle} type="checkbox" role="switch" checked={row.active} disabled={pending}
            aria-label={'Active status for ' + row.code} onChange={async () => {
              if (await submit('set-coupon-status', { isActive: !row.active }, row.id)) router.refresh();
            }}/>}{row.active ? 'Active' : 'Inactive'}
        </span></td>
        <td>{date(row.expires)}{Date.parse(row.expires) < Date.now() && <small className={design.expired}>Expired</small>}</td>
        <td><div className={details.tableActions}><Link className={styles.outline}
          href={scope(listPath + '/' + row.id, region, query ? 'details' : undefined)} aria-label={'View ' + row.code}><Eye size={16}/></Link>
          {canDelete && <ProductionCatalogActions label="Open menu" title="Actions">{close => <button type="button" onClick={() => { close(); setDeleteTarget(row); }}>Delete Coupon</button>}</ProductionCatalogActions>}
        </div></td>
      </tr>)}{rows.length === 0 && <tr><td colSpan={8} className={styles.empty}>No data found!</td></tr>}</tbody>
    </table></div>
    <nav className={details.pages} aria-label="Pages">
      <RegistryPageSize current={limit} choices={couponPageSizes} path={listPath} params={{ ...regionParams(region), ...query }}/>
      {page > 1 ? <Link className={styles.outline} href={href(page - 1)}>Previous</Link> : <button className={styles.outline} disabled>Previous</button>}
      {hasNext ? <Link className={styles.outline} href={href(page + 1)}>Next</Link> : <button className={styles.outline} disabled>Next</button>}
    </nav>
    {deleteTarget && <dialog ref={node => { if (node && !node.open) node.showModal(); }} className={editor.editorDialog} aria-labelledby="coupon-delete-title" onClose={() => setDeleteTarget(undefined)}>
      <div className={editor.dialogHeading}><h3 id="coupon-delete-title">Delete Coupon</h3></div>
      <p>Are you sure you want to delete {deleteTarget.code}?</p>
      <div className={editor.saveActions}><button type="button" className={styles.outline} onClick={() => setDeleteTarget(undefined)}>Cancel</button>
        <button type="button" className={editor.danger} disabled={pending} onClick={async () => {
          if (await submit('delete-coupon', undefined, deleteTarget.id)) { setDeleteTarget(undefined); router.refresh(); }
        }}>Delete Coupon</button></div>
      <PromotionResult result={result?.ok ? undefined : result}/>
    </dialog>}
  </section>;
}

function ScopeChoices({ label, options, selected, change, placeholder = 'Select options', disabled = false, search, onSearch }: {
  label: string; options: CouponChoice[]; selected: CouponChoice[]; change: (options: CouponChoice[]) => void; placeholder?: string;
  disabled?: boolean; search?: string; onSearch?: (search: string) => void;
}) {
  const [filter, setFilter] = useState('');
  const shown = options.filter(option => onSearch || option.label.toLowerCase().includes(filter.trim().toLowerCase()));
  return <div className={design.scope}>
    <span>{label}</span>
    {disabled ? <button className={styles.outline} type="button" disabled>{placeholder}</button> : <details>
      <summary>{selected.length ? selected.map(item => item.label).join(', ') : placeholder}<ChevronDown size={15}/></summary>
      <div className={design.choices}>
        <input aria-label={'Search ' + label.toLowerCase()} type="search" placeholder="Search..." value={search ?? filter}
          onChange={event => (onSearch ?? setFilter)(event.target.value)}/>
        {[...selected.filter(item => !shown.some(option => option.id === item.id)), ...shown].map(item => {
          const checked = selected.some(option => option.id === item.id);
          return <label key={item.id}><input type="checkbox" checked={checked} disabled={!checked && selected.length >= 100}
            onChange={() => change(checked ? selected.filter(option => option.id !== item.id) : [...selected, item])}/>{item.label}</label>;
        })}
        {!shown.length && <p>No results found.</p>}
      </div>
    </details>}
  </div>;
}

const choice = (items: CategoryOption[]) => items.map(item => ({ id: item.id, label: item.name }));
function useCouponProducts(region: Region, query: string, product: string) {
  const [products, setProducts] = useState<CouponChoice[]>([]);
  const [variants, setVariants] = useState<CouponChoice[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(adminPath('/api/promotion-settings?' + new URLSearchParams({ region, q: query })), { signal: controller.signal });
        if (!response.ok) throw new Error();
        setProducts(await response.json());
        setError('');
      } catch { if (!controller.signal.aborted) setError('Product options could not be loaded.'); }
    }, 160);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [region, query]);
  useEffect(() => {
    const controller = new AbortController();
    setVariants([]);
    if (product) void (async () => {
      try {
        const response = await fetch(adminPath('/api/promotion-settings?' + new URLSearchParams({ region, product })), { signal: controller.signal });
        if (!response.ok) throw new Error();
        setVariants(await response.json());
        setError('');
      } catch { if (!controller.signal.aborted) setError('Variant options could not be loaded.'); }
    })();
    return () => controller.abort();
  }, [region, product]);
  return { products, variants, error };
}

export function ProductionCouponCreate({ tree, region, starts, expires, openedAt, initialActive = true, listPath = couponPath }: {
  tree: CategoryOption[]; region: Region; starts: string; expires: string; openedAt: number; initialActive?: boolean; listPath?: string;
}) {
  const router = useRouter();
  const { submit, pending, result } = usePromotionSave();
  const [type, setType] = useState('FLAT');
  const [discount, setDiscount] = useState('0');
  const [category, setCategory] = useState<CouponChoice[]>([]);
  const [subcategory, setSubcategory] = useState<CouponChoice[]>([]);
  const [subsub, setSubsub] = useState<CouponChoice[]>([]);
  const [product, setProduct] = useState<CouponChoice[]>([]);
  const [variants, setVariants] = useState<CouponChoice[]>([]);
  const [query, setQuery] = useState('');
  const middle = tree.filter(item => category.some(option => option.id === item.id)).flatMap(item => item.children);
  const leaves = middle.filter(item => subcategory.some(option => option.id === item.id)).flatMap(item => item.children);
  const productOptions = useCouponProducts(region, query, product.at(-1)?.id ?? '');
  const ids = (choices: CouponChoice[]) => choices.map(item => item.id);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const offset = region === 'BD' ? '+06:00' : 'Z';
    const startDay = String(data.get('startAt'));
    const expireDay = String(data.get('expireAt'));
    const startAt = startDay === starts ? new Date(openedAt).toISOString() : startDay + 'T00:00' + offset;
    const expireAt = expireDay === expires ? new Date(openedAt + 7 * 86400000).toISOString() : expireDay + 'T00:00' + offset;
    const values = { ...Object.fromEntries(data), isActive: data.get('isActive') === 'true', firstOrderOnly: data.get('firstOrderOnly') === 'true',
      maxDiscountAmount: type === 'FLAT' ? discount : data.get('maxDiscountAmount'), startAt, expireAt,
      categoryIds: subcategory.length || subsub.length ? [] : ids(category),
      subcategoryIds: subsub.length ? [] : ids(subcategory), sub_subcategoryIds: ids(subsub), productIds: variants.length ? [] : ids(product), variant: ids(variants) };
    if (await submit('create-coupon', values)) { router.push(scope(listPath, region)); router.refresh(); }
  }
  return <section className={styles.page + ' ' + editor.editor}>
    <header className={editor.pageHeading}><Link className={editor.back} href={scope(listPath, region)} aria-label="Back to coupons"><ChevronLeft size={16}/></Link><h1>Create Coupon</h1></header>
    <form className={editor.form} onSubmit={save}>
      <ProductEditorPanel>
        <label className={editor.field}>Coupon Code<input name="code" placeholder="NEWYEAR2026" required maxLength={40}/></label>
        <div className={editor.pairedFields}>
          <label className={editor.field}>Discount Type<select name="discountType" value={type} onChange={event => setType(event.target.value)}>
            <option value="PERCENTAGE">Percentage</option><option value="FLAT">Flat Amount</option></select></label>
          <ProductEditorSwitch name="isActive" label="Active Status" hint="Enable this coupon" initial={initialActive}/>
          <label className={editor.field}>Discount Value<input name="discountValue" type="number" min="0.01" max={type === 'PERCENTAGE' ? '100' : '99999999'}
            step=".01" value={discount} required onChange={event => setDiscount(event.target.value)}/></label>
          <label className={editor.field}>Max Discount Amount{type === 'FLAT' ? <input type="number" value={discount} disabled/>
            : <input name="maxDiscountAmount" type="number" min="0" max="99999999" step=".01" defaultValue="0"/>}</label>
        </div>
        <label className={editor.field}>Description<textarea name="description" maxLength={500} rows={3}/></label>
        <div className={editor.pairedFields}>
          <label className={editor.field}>Start Date<input type="date" name="startAt" required defaultValue={starts}/></label>
          <label className={editor.field}>Expiry Date<input type="date" name="expireAt" required defaultValue={expires}/></label>
        </div>
        <small>(by default 7 days)</small>
      </ProductEditorPanel>
      <ProductEditorPanel title="Category Targeting (Optional)"><div className={editor.fields}>
        <ScopeChoices label="Categories" options={choice(tree)} selected={category} change={items => {
          setCategory(items);
          const availableSubcategory = tree.filter(node => items.some(item => item.id === node.id)).flatMap(node => node.children);
          const valid = subcategory.filter(item => availableSubcategory.some(node => node.id === item.id));
          setSubcategory(valid);
          setSubsub(subsub.filter(item => availableSubcategory.some(node => valid.some(parent => parent.id === node.id) && node.children.some(leaf => leaf.id === item.id))));
        }}/>
        <ScopeChoices label="Sub-Categories" options={choice(middle)} selected={subcategory} change={items => {
          setSubcategory(items);
          setSubsub(subsub.filter(item => middle.some(node => items.some(parent => parent.id === node.id) && node.children.some(leaf => leaf.id === item.id))));
        }}/>
        <ScopeChoices label="Sub-Sub-Categories" options={choice(leaves)} selected={subsub} change={setSubsub}/>
      </div></ProductEditorPanel>
      <ProductEditorPanel title="Product &amp; Variant Targeting (Optional)"><div className={editor.pairedFields}>
        <ScopeChoices label="Select Products" placeholder="Choose products..." options={productOptions.products} selected={product}
          change={items => { if (items.at(-1)?.id !== product.at(-1)?.id) setVariants([]); setProduct(items); }} search={query} onSearch={setQuery}/>
        <ScopeChoices label="Select Specific Variants" placeholder={product.length ? 'Choose variants...' : 'Select a product first'}
          options={productOptions.variants} selected={variants} change={setVariants} disabled={!product.length}/>
        {productOptions.error && <p role="alert">{productOptions.error}</p>}
      </div></ProductEditorPanel>
      <ProductEditorPanel title="Additional Info (Optional)">
        <div className={editor.fields}>
          {([['usageLimit', 'Total Usage Limit', '50'], ['usagePerUser', 'Usage Per User', '0'], ['minOrderAmount', 'Min Order Amount', '0']] as const).map(([name, label, initial]) =>
            <label className={editor.field} key={name}>{label}<input name={name} type="number" min="0" max="99999999" step={name.startsWith('usage') ? '1' : '.01'} defaultValue={initial}/></label>)}
        </div>
        <ProductEditorSwitch name="firstOrderOnly" label="First Order Only?" hint="" initial={false}/>
      </ProductEditorPanel>
      <PromotionResult result={result}/>
      <div className={editor.saveActions}><button className={styles.primary} disabled={pending}>{pending ? 'Saving…' : 'Save Coupon'}</button></div>
    </form>
  </section>;
}

export function ProductionCouponDetail({ coupon, region, listPath = couponPath, editUrl }: {
  coupon: CouponSummary & { description: string; starts: string; created: string; details: [string,string][]; targeting: [string,string[]][] };
  region: Region; listPath?: string; editUrl?: string;
}) {
  return <section className={styles.page}>
    <header className={editor.pageHeading}><Link className={styles.outline} href={scope(listPath, region)} aria-label="Back to coupons"><ChevronLeft size={16}/></Link><h1>Coupon Details</h1>
      {editUrl && <Link className={styles.primary} href={editUrl}>Edit coupon</Link>}
    </header>
    <div className={design.hero}><div><p><Ticket size={18}/> {coupon.code} <span className={styles.activeBadge} data-active={coupon.active}>{coupon.active ? 'Active' : 'Inactive'}</span></p>
      <strong>{coupon.discount}{coupon.type === 'PERCENTAGE' ? '%' : ''}</strong><span>OFF DISCOUNT</span><p>{coupon.description}</p></div></div>
    <div className={design.detailGrid}>
      <section><h2>Coupon Conditions</h2><dl>{coupon.details.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
      <section><h2>Validity Schedule</h2><dl><div><dt>Starts From</dt><dd>{date(coupon.starts)}</dd></div><div><dt>Expires On</dt><dd>{date(coupon.expires)}</dd></div></dl></section>
      <section><h2>Targeting &amp; Eligibility</h2><dl>{coupon.targeting.map(([label, items]) => <div key={label}><dt>{label}</dt>
        <dd>{items.length ? <span className={details.tags}>{items.map((item, index) => <span key={index}>{item}</span>)}</span> : 'All'}</dd></div>)}</dl></section>
      <section><h2>Internal Metadata</h2><dl><div><dt>Created</dt><dd>{date(coupon.created)}</dd></div><div><dt>ID</dt><dd>{coupon.id.slice(-6)}</dd></div></dl></section>
    </div>
  </section>;
}
