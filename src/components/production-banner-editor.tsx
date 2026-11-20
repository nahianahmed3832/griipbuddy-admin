'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import { productionCmsPreview } from '@/lib/production-cms-media';
import type { ContentProduct } from '@/lib/content-products';
import { ContentProductPicker, ProductReferences } from './content-product-picker';
import styles from './production-content.module.css';

type Banner = { _id?: string; banner_url: string; products_id: string[] };
type Kind = 'banners' | 'featured_products' | 'mobile_banners';
type Document = { _id?: string; updatedAt?: string } & Partial<Record<Kind, Banner[]>>;

const groups: { id: Kind; title: string; add: string }[] = [
  { id: 'banners', title: 'Desktop Banners', add: 'Add New Banner' },
  { id: 'featured_products', title: 'Featured Banners', add: 'Add Featured Banner' },
  { id: 'mobile_banners', title: 'Mobile Banners', add: 'Add Mobile Banner' },
];

export function ProductionBannerEditor({ doc, writable, allowUploads, allowProducts, products }: {
  doc: Document; writable: boolean; allowUploads: boolean; allowProducts: boolean; products: ContentProduct[];
}) {
  return <div className={styles.page}>{groups.map(group => <BannerGroup key={group.id + (doc.updatedAt || '')}
    {...group} rows={doc[group.id] || []} doc={doc} writable={writable} allowUploads={allowUploads} allowProducts={allowProducts} productOptions={products}/>)}</div>;
}

function BannerGroup({ id, title, add, rows, doc, writable, allowUploads, allowProducts, productOptions }: {
  id: Kind; title: string; add: string; rows: Banner[]; doc: Document; writable: boolean; allowUploads: boolean; allowProducts: boolean; productOptions: ContentProduct[];
}) {
  const router = useRouter();
  const [source, setSource] = useState('');
  const [products, setProducts] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(value: Banner[]) {
    const response = await fetch(adminPath('/api/workspace'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'content', values: { section: id, id: doc._id ?? null, revision: doc.updatedAt ?? null, value } }),
    });
    if (!response.ok) throw new Error((await response.text()).slice(0, 250));
    router.refresh();
  }

  async function mutate(value: Banner[]) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await save(value);
      setSource('');
      setProducts('');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save the banner.'); }
    finally { setBusy(false); }
  }

  async function upload(file?: File) {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.set('file', file);
      const response = await fetch(adminPath('/api/media/upload?kind=image'), { method: 'POST', body });
      const result = await response.json();
      if (!response.ok || typeof result.url !== 'string') throw new Error(result.error || 'Could not upload the banner.');
      setSource(result.url);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not upload the banner.'); }
    finally { setBusy(false); }
  }

  function addBanner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!source || rows.length >= 20) return;
    void mutate([...rows, { banner_url: source, products_id: products.split(/[\s,]+/).filter(Boolean) }]);
  }

  return <section className={styles.bannerGroup}>
    <h1>{title}</h1>
    {writable && <form className={styles.bannerCard} onSubmit={addBanner}>
      {allowUploads ? <label className={styles.bannerUpload}><Plus size={22}/><span>{source ? 'Replace image' : 'Click to upload'}
        <small>Supported: .webp (preferred), .png, .jpg, .jpeg, .svg, .ico (max: 5MB)</small></span>
        <input type="file" hidden accept="image/webp,image/png,image/jpeg,image/avif,image/svg+xml,image/x-icon,image/vnd.microsoft.icon,.ico" disabled={busy} onChange={event => {
          const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void upload(file);
        }}/>
      </label> : <label>Image URL<input type="url" value={source} onChange={event => setSource(event.currentTarget.value)}/></label>}
      {!!source && <BannerImage source={source}/>}
      {allowProducts && <ContentProductPicker multiple production value={products} update={setProducts}/>}
      <button className="button primary" disabled={busy || !source || rows.length >= 20}>{add}</button>
    </form>}
    {error && <p className="notice warn" role="alert">{error}</p>}
    {rows.length > 0 && <div className={styles.bannerRows}>{rows.map((banner, index) => <article className={styles.bannerCard} key={banner._id || banner.banner_url + index}>
      <BannerImage source={banner.banner_url}/>
      {allowProducts && banner.products_id?.length > 0 && <ProductReferences ids={banner.products_id} products={productOptions}/>}
      {writable && <button type="button" className="button subtle" aria-label={'Delete banner ' + (index + 1)} disabled={busy}
        onClick={() => { if (window.confirm('Delete this banner?')) void mutate(rows.filter((_, position) => position !== index)); }}><Trash2 size={16}/></button>}
    </article>)}</div>}
  </section>;
}

function BannerImage({ source }: { source: string }) {
  const url = productionCmsPreview(source);
  if (!/^https:\/\/[^\s]+$/i.test(url) && !/^\/(?![\/\\])[^\s]*$/.test(url)) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.bannerImage} src={url} alt="Banner Image" referrerPolicy="no-referrer"/>;
}
