'use client';

import * as Popover from '@radix-ui/react-popover';
import { Search, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { adminPath } from '@/lib/paths';
import { contentProductImage } from '@/lib/content-products';
import { useProductOptions } from './content-product-picker';
import styles from './production-content.module.css';

export type FeaturedVariant = { product: string; variant: string; name: string; sku: string; image?: string };

export function ProductionFeaturedProducts({ initial, canAdd, canRemove, legacyPlacement = false }: { initial: FeaturedVariant[]; canAdd: boolean; canRemove: boolean; legacyPlacement?: boolean }) {
  const [rows, setRows] = useState(initial);
  const [chosen, setChosen] = useState<FeaturedVariant>();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const dialog = useRef<HTMLDialogElement>(null);
  const [removing, setRemoving] = useState<FeaturedVariant>();
  const { options, message: searchMessage, clear } = useProductOptions<FeaturedVariant>('/api/featured-variants', term, open);
  const grouped = new Map<string, FeaturedVariant[]>();
  for (const row of options) {
    const variants = grouped.get(row.product) ?? [];
    variants.push(row);
    grouped.set(row.product, variants);
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
      if (remove) { dialog.current?.close(); setRemoving(undefined); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not change the featured products.'); }
    finally { setBusy(false); }
  }

  return <section className={styles.page}>
    <header className={styles.heading}><div><h1>{legacyPlacement ? 'Legacy featured variants' : 'Featured Products'}</h1>
      {legacyPlacement && <p>These variant placements appear in the legacy storefront.</p>}</div></header>
    {canAdd && <section className={styles.bannerCard}>
      <h2>Add New Featured Product</h2>
      <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (!next) { clear(); setTerm(''); } }}>
        <Popover.Trigger type="button" className={styles.productTrigger}>{chosen ? chosen.name + ' · ' + chosen.sku : 'Select product...'}</Popover.Trigger>
        <Popover.Content className={styles.productPopover} sideOffset={4} align="start" aria-label="Product variants">
          <label><Search size={16} aria-hidden="true"/><input type="search" aria-label="Search products" placeholder="Search products..."
            maxLength={100} value={term} onChange={event => { clear(); setTerm(event.target.value); }}/></label>
          {searchMessage && <p role="status">{searchMessage}</p>}
          <ul>{Array.from(grouped, ([product, variants]) => <li key={product}>
            <strong>{variants[0].name}</strong>
            <ul>{variants.map(row => <li key={row.variant}><button type="button" disabled={rows.some(item => item.variant === row.variant)}
              onClick={() => { setChosen(row); setOpen(false); clear(); setTerm(''); }}>{row.sku}</button></li>)}</ul>
          </li>)}</ul>
        </Popover.Content>
      </Popover.Root>
      <button type="button" className="button primary" disabled={!chosen || busy || rows.length >= 3} onClick={() => void save()}>Make Featured Product</button>
    </section>}
    {message && !removing && <p role="alert" className="notice warn">{message}</p>}
    {rows.length > 0 && <div className={styles.bannerRows}>{rows.map(row => <article className={styles.bannerCard} key={row.variant}>
      {contentProductImage(row.image) && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.bannerImage} src={contentProductImage(row.image)} alt="" referrerPolicy="no-referrer"/>
      )}
      <h2>{row.name}</h2><p>{row.sku}</p>
      {canRemove && <button type="button" className="button subtle" aria-label={'Remove ' + row.name} disabled={busy}
        onClick={() => { setMessage(''); setRemoving(row); dialog.current?.showModal(); }}><Trash2 size={16}/></button>}
    </article>)}</div>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="delete-featured-title"
      onCancel={event => { if (busy) event.preventDefault(); }} onClose={() => setRemoving(undefined)}>
      <h2 id="delete-featured-title">Remove Featured Product</h2>
      <p>Remove {removing?.name} · {removing?.sku} from the featured products?</p>
      {message && <p role="alert" className="notice warn">{message}</p>}
      <div className="page-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={() => dialog.current?.close()}>Cancel</button>
        <button type="button" className="button primary" disabled={busy || !removing} onClick={() => removing && void save(removing.variant)}>
          {busy ? 'Removing…' : 'Remove'}
        </button>
      </div>
    </dialog>
  </section>;
}
