'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { adminPath } from '@/lib/paths';
import { preOrderItems, preOrderMedia, preOrderProduct, preOrderRequest, preOrdersPath, productionPreOrdersPath, type PreOrderItem, type PreOrderRow, type Products } from '@/lib/preorders';
import { Amount, encodePreOrderImage, fieldNumber, fieldText, StatusSelect, usePreOrderInteractive } from './preorders-actions';
import styles from './preorders.module.css';

type Line = PreOrderItem & { key: number; productLabel?: string };

export function PreOrderForm({ row, allowProducts, productionLayout = false, mediaOrigin = '' }: {
  row?: PreOrderRow; allowProducts: boolean; productionLayout?: boolean; mediaOrigin?: string;
}) {
  const router = useRouter();
  const ready = usePreOrderInteractive();
  const nextKey = useRef(row ? preOrderItems(row).length : 1);
  const [lines, setLines] = useState<Line[]>(() => row ? preOrderItems(row).map((item, key) => ({
    ...item, key, productLabel: preOrderProduct(item), product: typeof item.product === 'string' ? item.product : item.product?._id,
  })) : [{ key: 0, source_type: 'EXTERNAL', quantity: 1 }]);
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Products | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [referenceImages, setReferenceImages] = useState<Record<number, string>>(() => Object.fromEntries(lines.map(line => [line.key, line.reference?.images?.join('\n') || ''])));
  const [imageUpload, setImageUpload] = useState<number | undefined>();

  async function findProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setSearchError('');
    try {
      setProducts(await preOrderRequest<Products>('products', { q: search }));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Could not search products.');
    } finally {
      setSearching(false);
    }
  }
  function append(item: Omit<Line, 'key'>) {
    const key = nextKey.current++;
    setLines(all => [...all, { ...item, key }]);
  }
  async function uploadImages(key: number, files: File[]) {
    if (!files.length) return;
    const images = (referenceImages[key] || '').split('\n').filter(value => value.trim());
    if (images.length + files.length > 6) { setError('Each reference can contain up to six images.'); return; }
    setImageUpload(key);
    setError('');
    try {
      for (const file of files) {
        const image = await encodePreOrderImage(file);
        const { key: uploaded } = await preOrderRequest<{ key: string }>(row ? 'reference-edit' : 'reference-create', {}, { image });
        images.push(uploaded);
        setReferenceImages(current => ({ ...current, [key]: images.join('\n') }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload the image.');
    } finally {
      setImageUpload(undefined);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const items = lines.map<PreOrderItem>(line => {
      const key = line.key;
      const shared = {
        source_type: line.source_type,
        quantity: fieldNumber(data, 'quantity-' + key),
        unit_price: productionLayout ? line.unit_price : fieldNumber(data, 'unit-' + key),
        quoted_unit_price: fieldNumber(data, 'quote-' + key),
      };
      if (line.source_type === 'LISTED') return { ...shared, product: line.product, product_name: line.product_name,
        product_image: line.product_image, variant: line.variant };
      return { ...shared, reference: {
        product_name: fieldText(data, 'name-' + key),
        product_link: fieldText(data, 'link-' + key),
        images: (fieldText(data, 'images-' + key) ?? '').split('\n').map(value => value.trim()).filter(Boolean),
        color: fieldText(data, 'color-' + key), size: fieldText(data, 'size-' + key), notes: fieldText(data, 'notes-' + key),
      } };
    });
    try {
      for (const item of items) {
        if (item.source_type === 'LISTED' && !item.product) throw new Error('Replace the catalog item whose product no longer exists.');
        if ((item.reference?.images?.length ?? 0) > 6) throw new Error('Each reference can contain up to six images.');
      }
      const quotedUnit = productionLayout ? row?.quoted_unit_price : fieldNumber(data, 'quote');
      let total = productionLayout ? row?.quoted_total : fieldNumber(data, 'total');
      if (row && total === row.quoted_total) {
        const pricing = (items: PreOrderItem[]) => JSON.stringify(items.map(item => [item.quantity ?? 1, item.quoted_unit_price]));
        if (quotedUnit !== row.quoted_unit_price || pricing(items) !== pricing(preOrderItems(row))) {
          const itemPricing = items.some(item => item.quoted_unit_price !== undefined);
          if (itemPricing) total = undefined;
          else if (quotedUnit !== undefined) total = quotedUnit * items.reduce((sum, item) => sum + (item.quantity ?? 1), 0);
        }
      }
      const result = await preOrderRequest<{ _id: string }>(row ? 'edit' : 'create', { id: row?._id }, {
        items,
        customer_name: fieldText(data, 'name'),
        customer_phone: fieldText(data, 'phone'),
        customer_secondary_phone: fieldText(data, 'phone2'),
        customer_email: fieldText(data, 'email') ?? '',
        delivery_address: { address: fieldText(data, 'address'), district: fieldText(data, 'district'),
          thana: fieldText(data, 'thana'), division: fieldText(data, 'division') },
        customer_note: fieldText(data, 'customerNote') ?? '',
        batch: fieldText(data, 'batch') ?? '',
        advance_amount: fieldNumber(data, 'advance'),
        quoted_unit_price: quotedUnit,
        delivery_charge: fieldNumber(data, 'delivery'),
        ...(row ? { quoted_total: total, courier_note: productionLayout ? row.courier_note : fieldText(data, 'courierNote') ?? '' } : { status: fieldText(data, 'status') }),
      });
      router.push(productionLayout ? productionPreOrdersPath + (row ? '/' + result._id : '') : adminPath(preOrdersPath + '/' + result._id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the pre-order.');
    } finally {
      setSaving(false);
    }
  }
  if (productionLayout) {
    const quotedTotal = lines.reduce((sum, line) => sum + (line.quantity ?? 1) * (line.quoted_unit_price ?? 0), 0);
    const updateLine = (key: number, values: Partial<Line>) => setLines(all => all.map(line => line.key === key ? { ...line, ...values } : line));
    const removeLine = (key: number) => setLines(all => all.filter(line => line.key !== key));
    return <form className={styles.formSections} onSubmit={submit}>
      <section className={styles.productsForm} aria-label="Products">
        <div className={styles.splitHeading}><h2>Products ({lines.length})</h2><button type="button" className={styles.control} disabled={lines.length >= 30}
          onClick={() => append({ source_type: 'EXTERNAL', quantity: 1 })}><Plus size={16}/> Add product</button></div>
        {lines.map((line, index) => {
          const images = (referenceImages[line.key] ?? '').split('\n').filter(Boolean);
          const referenceField = (key: keyof NonNullable<PreOrderItem['reference']>, value: string) =>
            updateLine(line.key, { reference: { ...line.reference, [key]: value } });
          return <section className={styles.formCard} key={line.key} aria-label={'Product ' + (index + 1)}>
            <div className={styles.splitHeading}><strong>Product #{index + 1}</strong>{lines.length > 1 && <button type="button" className={styles.deleteIcon}
              onClick={() => removeLine(line.key)} aria-label={'Remove product ' + (index + 1)}><Trash2 size={16}/></button>}</div>
            <div className={styles.inline}>
              {(['EXTERNAL', 'LISTED'] as const).map(source => <button type="button" key={source} className={line.source_type === source ? styles.primary : styles.control}
                aria-pressed={line.source_type === source} disabled={source === 'LISTED' && !allowProducts && line.source_type !== source}
                onClick={() => updateLine(line.key, { source_type: source })}>{source === 'EXTERNAL' ? 'From another site' : 'From our store'}</button>)}
            </div>
            {line.source_type === 'LISTED' ? <PreOrderCatalogProduct line={line} enabled={allowProducts} mediaOrigin={mediaOrigin}
              update={values => updateLine(line.key, values)}/> : <>
              <div className={styles.formTwo} key={'reference-' + line.key}>
                <label>Product Name *<input name={'name-' + line.key} value={line.reference?.product_name ?? ''} onChange={event => referenceField('product_name', event.target.value)} placeholder="e.g. Nike Air Max" maxLength={240} required /></label>
                <label>Product Link<input name={'link-' + line.key} type="url" value={line.reference?.product_link ?? ''} onChange={event => referenceField('product_link', event.target.value)} placeholder="https://..." maxLength={1600} /></label>
                <label>Color<input name={'color-' + line.key} value={line.reference?.color ?? ''} onChange={event => referenceField('color', event.target.value)} maxLength={80} /></label>
                <label>Size<input name={'size-' + line.key} value={line.reference?.size ?? ''} onChange={event => referenceField('size', event.target.value)} maxLength={80} /></label>
              </div>
              <div className={styles.referenceFields}>
                <span>Reference Images</span><input type="hidden" name={'images-' + line.key} value={images.join('\n')}/>
                <div className={styles.inline}>
                  {images.map((value, imageIndex) => <div className={styles.imageTile} key={value + imageIndex}>
                    <ProductThumbnail source={value} origin={mediaOrigin} alt={'Reference image ' + (imageIndex + 1)} size={64}/>
                    <button type="button" onClick={() => setReferenceImages(current => ({ ...current, [line.key]: images.filter((_, at) => at !== imageIndex).join('\n') }))}
                      aria-label={'Remove reference image ' + (imageIndex + 1)} className={styles.removeImage}><X size={12}/></button>
                  </div>)}
                  {images.length < 6 && <label className={styles.imageUpload}>
                    {imageUpload === line.key ? '…' : <Plus size={16}/>}
                    <input type="file" accept="image/png,image/jpeg,image/webp" multiple aria-label="Upload reference images" disabled={imageUpload !== undefined || !ready}
                      onChange={event => { void uploadImages(line.key, Array.from(event.target.files ?? [])); event.target.value = ''; }}/>
                  </label>}
                </div>
              </div>
              <label>Notes<textarea rows={2} name={'notes-' + line.key} value={line.reference?.notes ?? ''} onChange={event => referenceField('notes', event.target.value)} maxLength={600}/></label>
            </>}
            <div className={styles.quantityGrid}>
              <label>Quantity<input name={'quantity-' + line.key} type="number" value={line.quantity ?? 1} min="1" max="10000" step="1" required
                onChange={event => updateLine(line.key, { quantity: event.target.valueAsNumber || 1 })}/></label>
              <label>Unit Price (quote)<input name={'quote-' + line.key} type="number" value={line.quoted_unit_price ?? ''} min="0" max="10000000" step="0.01" placeholder="Optional"
                onChange={event => updateLine(line.key, { quoted_unit_price: event.target.value ? event.target.valueAsNumber : undefined })}/></label>
            </div>
          </section>;
        })}
      </section>
      <section className={`${styles.formCard} ${styles.formTwo}`} aria-label="Customer">
        <label>Customer Name *<input name="name" defaultValue={row?.customer_name} maxLength={160} required/></label>
        <label>Phone *<input name="phone" type="tel" pattern="01[0-9]{9}" placeholder="01XXXXXXXXX" defaultValue={row?.customer_phone} required/></label>
        <label>Secondary Phone<input name="phone2" type="tel" pattern="01[0-9]{9}" defaultValue={row?.customer_secondary_phone}/></label>
        <label>Email<input name="email" type="email" defaultValue={row?.customer_email} maxLength={160}/></label>
        <label>Division<input name="division" defaultValue={row?.delivery_address?.division} maxLength={80}/></label>
        <label>District<input name="district" defaultValue={row?.delivery_address?.district} maxLength={80}/></label>
        <label>Thana<input name="thana" defaultValue={row?.delivery_address?.thana} maxLength={80}/></label>
        <label className={styles.fullField}>Address *<textarea rows={2} name="address" defaultValue={row?.delivery_address?.address} maxLength={500} required/></label>
        <label className={styles.fullField}>Customer Note<textarea rows={2} name="customerNote" defaultValue={row?.customer_note} maxLength={600}/></label>
      </section>
      <section className={`${styles.formCard} ${styles.formThree}`} aria-label={row ? 'Amounts' : 'Optional Quote'}>
        <div className={`${styles.fullField} ${styles.splitHeading}`}><strong>{row ? 'Amounts' : 'Optional Quote'}</strong>
          {row && <span className={styles.muted}>Quoted total (from items): <strong>{quotedTotal || 0}</strong></span>}</div>
        <Amount label={row ? 'Advance Required' : 'Advance'} name="advance" initial={row?.advance_amount}/>
        <Amount label="Delivery Charge" name="delivery" initial={row?.delivery_charge}/>
        <label>Batch<input name="batch" defaultValue={row?.batch} maxLength={120}/></label>
      </section>
      {error && <p role="alert">{error}</p>}
      <div className={styles.formFooter}><button className={styles.primary} disabled={saving || !ready || imageUpload !== undefined}>
        {saving ? (row ? 'Saving...' : 'Creating...') : row ? 'Save Changes' : 'Create Pre-Order'}</button>
        {row && <Link className={styles.control} href={productionPreOrdersPath + '/' + row._id}>Cancel</Link>}
      </div>
    </form>;
  }
  return <div className="stack">
    {allowProducts && <form className="panel padded stack" onSubmit={findProducts} role="search" aria-label="Find catalog items">
      <div className="filters">
        <label>Catalog product or SKU<input value={search} onChange={event => setSearch(event.target.value)} maxLength={80} required disabled={!ready} /></label>
        <button className="button secondary" disabled={searching || !ready}>{searching ? 'Searching…' : 'Find products'}</button>
      </div>
      {searchError && <p role="alert">{searchError}</p>}
      {products?.length === 0 && <p>No catalog products match.</p>}
      {!!products?.length && <ul>{products.map(product => (
        <li key={product.id + product.sku}>{product.name} · {product.sku}{' '}
          <button type="button" className="button secondary" disabled={lines.length >= 30} onClick={() => append({
            source_type: 'LISTED', product: product.id, product_name: product.name, productLabel: product.name, product_image: product.image,
            variant: { sku: product.sku, image: product.image, attribute_values: product.attributes }, quantity: 1, unit_price: product.price,
          })}>Add {product.sku}</button>
        </li>
      ))}</ul>}
    </form>}
    <form className="panel padded stack" onSubmit={submit}>
      <h2>Products</h2>
      {lines.map((line, index) => <fieldset className="panel padded stack" key={line.key}>
        <legend>Product {index + 1} · {line.source_type === 'LISTED' ? 'Catalog item' : 'External reference'}</legend>
        {line.source_type === 'LISTED' && <p>{line.productLabel} · {line.variant?.sku}</p>}
        <div className="filters">
          {line.source_type === 'EXTERNAL' && <>
            <label>Product name<input name={'name-' + line.key} defaultValue={line.reference?.product_name} maxLength={240} required /></label>
            <label>Product link<input name={'link-' + line.key} type="url" defaultValue={line.reference?.product_link} maxLength={1600} /></label>
            <label>Color<input name={'color-' + line.key} defaultValue={line.reference?.color} maxLength={80} /></label>
            <label>Size<input name={'size-' + line.key} defaultValue={line.reference?.size} maxLength={80} /></label>
            <label>Reference images, one link per line<textarea name={'images-' + line.key} value={referenceImages[line.key] || ''} maxLength={5000}
              disabled={imageUpload === line.key} onChange={event => setReferenceImages(current => ({ ...current, [line.key]: event.target.value }))} /></label>
            <label>{imageUpload === line.key ? 'Uploading image…' : 'Upload a reference image'}<input type="file" accept="image/png,image/jpeg,image/webp"
              disabled={imageUpload !== undefined || !ready} onChange={event => {
                void uploadImages(line.key, Array.from(event.target.files ?? []));
                event.target.value = '';
              }} /></label>
            <label>Product notes<textarea name={'notes-' + line.key} defaultValue={line.reference?.notes} maxLength={600} /></label>
          </>}
          <label>Quantity<input name={'quantity-' + line.key} type="number" defaultValue={line.quantity ?? 1} min="1" max="10000" step="1" required /></label>
          <Amount label="Unit price" name={'unit-' + line.key} initial={line.unit_price} />
          <Amount label="Quoted unit price" name={'quote-' + line.key} initial={line.quoted_unit_price} />
        </div>
        <button type="button" className="button subtle" disabled={lines.length <= 1} onClick={() => setLines(all => all.filter(item => item.key !== line.key))}>
          Remove product {index + 1}
        </button>
      </fieldset>)}
      <div><button type="button" className="button secondary" disabled={lines.length >= 30} onClick={() => append({ source_type: 'EXTERNAL', quantity: 1 })}>
        Add external product
      </button></div>
      <h2>Customer and delivery</h2>
      <div className="filters">
        <label>Customer name<input name="name" defaultValue={row?.customer_name} maxLength={160} required /></label>
        <label>Customer phone<input name="phone" type="tel" pattern="01[0-9]{9}" defaultValue={row?.customer_phone} required /></label>
        <label>Secondary phone<input name="phone2" type="tel" pattern="01[0-9]{9}" defaultValue={row?.customer_secondary_phone} /></label>
        <label>Email<input type="email" name="email" defaultValue={row?.customer_email} maxLength={160} /></label>
        <label>Delivery address<textarea name="address" defaultValue={row?.delivery_address?.address} maxLength={500} required /></label>
        <label>Division<input name="division" defaultValue={row?.delivery_address?.division} maxLength={80} /></label>
        <label>District<input name="district" defaultValue={row?.delivery_address?.district} maxLength={80} /></label>
        <label>Thana<input name="thana" defaultValue={row?.delivery_address?.thana} maxLength={80} /></label>
        <label>Customer note<textarea name="customerNote" defaultValue={row?.customer_note} maxLength={600} /></label>
        {row && <label>Courier note<textarea name="courierNote" defaultValue={row.courier_note} maxLength={600} /></label>}
      </div>
      <h2>Quote and batch</h2>
      <div className="filters">
        <Amount label="Order quoted unit price" name="quote" initial={row?.quoted_unit_price} />
        {row && <Amount label="Quoted product total" name="total" initial={row.quoted_total} />}
        <Amount label="Advance required" name="advance" initial={row?.advance_amount} />
        <Amount label="Delivery charge" name="delivery" initial={row?.delivery_charge} />
        <label>Batch<input name="batch" defaultValue={row?.batch} maxLength={120} /></label>
        {!row && <StatusSelect required={false} />}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="filters">
        <button className="button primary" disabled={saving || !ready || imageUpload !== undefined}>{saving ? 'Saving…' : row ? 'Save pre-order' : 'Create pre-order'}</button>
        <Link className="button subtle" href={preOrdersPath + (row ? '/' + row._id : '')}>Cancel</Link>
      </div>
    </form>
  </div>;
}

function ProductThumbnail({ source, origin, alt, size }: { source?: string; origin: string; alt: string; size: number }) {
  const src = preOrderMedia(source, origin);
  return src ? <Image src={src} alt={alt} width={size} height={size} unoptimized className={styles.thumbnail}/>
    : <span aria-hidden="true" className={styles.thumbnail} style={{ width: size, height: size }}/>;
}

function PreOrderCatalogProduct({ line, enabled, mediaOrigin, update }: {
  line: Line; enabled: boolean; mediaOrigin: string; update: (values: Partial<Line>) => void;
}) {
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<{ query: string; products: Products; failed?: boolean }>();
  const query = search.trim();
  useEffect(() => {
    if (query.length < 2 || !enabled || line.product) return;
    let current = true;
    const timer = setTimeout(() => {
      void preOrderRequest<Products>('products', { q: query }).then(products => {
        if (current) setResult({ query, products });
      }, () => { if (current) setResult({ query, products: [], failed: true }); });
    }, 350);
    return () => { current = false; clearTimeout(timer); };
  }, [query, enabled, line.product]);
  return <div className={styles.referenceFields}>
    <label>Search Product<span className={styles.productSearch}><Search size={16}/><input value={search} disabled={!enabled || !!line.product} maxLength={80}
      onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} placeholder="Search by name, SKU, barcode..."/></span></label>
    {line.product ? <div className={styles.selectedProduct}>
      <ProductThumbnail source={line.product_image} origin={mediaOrigin} alt={line.productLabel ?? 'Product'} size={44}/>
      <div><strong>{line.productLabel}</strong><small>SKU: {line.variant?.sku}</small></div>
      {enabled && <button type="button" className={styles.iconButton} aria-label="Remove selected catalog item" onClick={() => {
        update({ product: undefined, product_name: undefined, productLabel: undefined, product_image: undefined, variant: undefined });
      }}><X size={16}/></button>}
    </div> : query.length >= 2 && result?.query === query && <div className={styles.productResults}>
      {result.failed && <p role="alert">Could not search products.</p>}
      {!result.failed && !result.products.length && <p className={styles.muted}>No products found</p>}
      {result.products.map(product => <button type="button" key={product.id + product.sku} onClick={() => update({
        product: product.id, product_name: product.name, productLabel: product.name, product_image: product.image,
        variant: { sku: product.sku, image: product.image, attribute_values: product.attributes },
        quoted_unit_price: line.quoted_unit_price ?? product.price,
      })}>
        <ProductThumbnail source={product.image} origin={mediaOrigin} alt={product.name} size={36}/>
        <span>{product.name}<small>SKU: {product.sku}{product.price !== undefined ? ' • ' + product.price : ''}</small></span>
      </button>)}
    </div>}
  </div>;
}
