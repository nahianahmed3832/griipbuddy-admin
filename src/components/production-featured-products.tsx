'use client';

import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { adminPath } from '@/lib/paths';
import { productionCmsPreview } from '@/lib/production-cms-media';
import styles from './production-content.module.css';

export type FeaturedVariant = { product: string; variant: string; name: string; sku: string; image?: string };

export function ProductionFeaturedProducts({ initial, canAdd, canRemove }: { initial: FeaturedVariant[]; canAdd: boolean; canRemove: boolean }) {
  const [rows, setRows] = useState(initial);
  const [chosen, setChosen] = useState<FeaturedVariant>();
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState('');
  const [options, setOptions] = useState<FeaturedVariant[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setMessage('');
    try {
      const response = await fetch(adminPath('/api/featured-variants?q=' + encodeURIComponent(term.trim())));
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setOptions(result);
      if (!result.length) setMessage('No matching products.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not search product variants.'); }
    finally { setSearching(false); }
  }

  async function save(remove?: string) {
    if (busy || !remove && !chosen) return;
    setBusy(true);
    setMessage('');
    try {
      const target = '/api/featured-variants' + (remove ? '?remove=' + encodeURIComponent(remove) : '');
      const response = await fetch(adminPath(target), {
        method: 'POST', ...(!remove && chosen && { headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product: chosen.product, variant: chosen.variant }) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setRows(result);
      setChosen(undefined);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not change the featured products.'); }
    finally { setBusy(false); }
  }

  return <section className={styles.page}>
    <header className={styles.heading}><div><h1>Featured Products</h1></div></header>
    {canAdd && <section className={styles.bannerCard}>
      <h2>Add New Featured Product</h2>
      <button type="button" className="button secondary" aria-expanded={open} onClick={() => setOpen(!open)}>{chosen ? chosen.name + ' · ' + chosen.sku : 'Select product...'}</button>
      {open && <form className={styles.bannerCard} onSubmit={search}>
        <label>Search products<input type="search" maxLength={100} value={term} onChange={event => setTerm(event.target.value)}/></label>
        <button className="button secondary" disabled={searching || term.trim().length < 2}>Search</button>
        {options.map(row => <button type="button" className="button subtle" key={row.variant}
          onClick={() => { setChosen(row); setOpen(false); }}>{row.name} · {row.sku}</button>)}
      </form>}
      <button type="button" className="button primary" disabled={!chosen || busy || rows.length >= 3} onClick={() => void save()}>Make Featured Product</button>
    </section>}
    {message && <p role="status">{message}</p>}
    {rows.length > 0 && <div className={styles.bannerRows}>{rows.map(row => <article className={styles.bannerCard} key={row.variant}>
      {row.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.bannerImage} src={productionCmsPreview(row.image)} alt="" referrerPolicy="no-referrer"/>
      )}
      <h2>{row.name}</h2><p>{row.sku}</p>
      {canRemove && <button type="button" className="button subtle" aria-label={'Remove ' + row.name} disabled={busy}
        onClick={() => { if (window.confirm('Remove this featured product?')) void save(row.variant); }}><Trash2 size={16}/></button>}
    </article>)}</div>}
  </section>;
}
