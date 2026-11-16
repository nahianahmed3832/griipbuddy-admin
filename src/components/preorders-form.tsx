'use client';

import { useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { adminPath } from '@/lib/paths';
import { preOrderItems, preOrderProduct, preOrderRequest, preOrdersPath, type PreOrderItem, type PreOrderRow, type Products } from '@/lib/preorders';
import { Amount, encodePreOrderImage, fieldNumber, fieldText, StatusSelect, usePreOrderInteractive } from './preorders-actions';

type Line = PreOrderItem & { key: number; productLabel?: string };

export function PreOrderForm({ row, allowProducts }: { row?: PreOrderRow; allowProducts: boolean }) {
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
  async function uploadImage(key: number, file?: File) {
    if (!file) return;
    const images = (referenceImages[key] || '').split('\n').filter(value => value.trim());
    if (images.length >= 6) { setError('Each reference can contain up to six images.'); return; }
    setImageUpload(key);
    setError('');
    try {
      const image = await encodePreOrderImage(file);
      const response = await preOrderRequest<{ key: string }>(row ? 'reference-edit' : 'reference-create', {}, { image });
      setReferenceImages(current => ({ ...current, [key]: [...images, response.key].join('\n') }));
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
        unit_price: fieldNumber(data, 'unit-' + key),
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
      const quotedUnit = fieldNumber(data, 'quote');
      let total = fieldNumber(data, 'total');
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
        ...(row ? { quoted_total: total, courier_note: fieldText(data, 'courierNote') ?? '' } : { status: fieldText(data, 'status') }),
      });
      router.push(adminPath(preOrdersPath + '/' + result._id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the pre-order.');
    } finally {
      setSaving(false);
    }
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
                void uploadImage(line.key, event.target.files?.[0]);
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
