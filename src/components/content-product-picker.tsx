'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { ChevronsUpDown, ImageOff, Search, X } from 'lucide-react';
import { contentProductImage, type ContentProduct } from '@/lib/content-products';
import styles from './production-content.module.css';
import { adminPath } from '@/lib/paths';

export function ProductReference({ item, children }: { item: ContentProduct; children?: React.ReactNode }) {
  const image = contentProductImage(item.image);
  return <span className={styles.productReference}>
    {image ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer"/>
    ) : <ImageOff size={17} aria-hidden="true"/>}
    <span>{item.name || 'Product unavailable'}</span>
    {children}
  </span>;
}

export function ProductReferences({ ids, products }: { ids: string[]; products: ContentProduct[] }) {
  return <ul className={styles.selectedProducts}>{ids.map(id => <li key={id}>
    <ProductReference item={products.find(product => product.id === id.toLowerCase()) ?? { id, name: 'Product unavailable' }}/>
  </li>)}</ul>;
}

export function useProductOptions<T>(endpoint: string, query: string, enabled: boolean) {
  const [options, setOptions] = useState<T[]>([]);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const term = query.trim();
    if (!enabled || term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setMessage('Searching…');
        const response = await fetch(adminPath(endpoint + '?q=' + encodeURIComponent(term)), { signal: controller.signal });
        if (!response.ok) throw new Error();
        const result = await response.json() as T[];
        setOptions(result);
        setMessage(result.length ? '' : 'No matching products.');
      } catch {
        if (!controller.signal.aborted) setMessage('Could not search products. Try again.');
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [endpoint, query, enabled]);
  return {
    options: query.trim().length < 2 ? [] : options,
    message: query.trim().length < 2 ? 'Enter at least two characters.' : message,
    clear: () => { setOptions([]); setMessage(''); },
  };
}

function ProductionProductPicker({ multiple, value, update, products }: {
  multiple: boolean; value: string; update: (value: string) => void; products: ContentProduct[];
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ContentProduct[]>([]);
  const { options, message, clear } = useProductOptions<ContentProduct>('/api/content-products', query, open);
  const ids = [...new Set(value.split(/[\s,]+/).filter(Boolean))];
  const label = (id: string) => [...products, ...selected].find(product => product.id === id.toLowerCase()) ?? { id, name: 'Product unavailable' };
  return <div className="cms-product-picker">
    <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (!next) { clear(); setQuery(''); } }}>
      <Popover.Trigger type="button" className={styles.productTrigger}>
        {!multiple && ids[0] ? <ProductReference item={label(ids[0])}/> : multiple ? 'Select products...' : 'Select product...'}
        <ChevronsUpDown size={16} aria-hidden="true"/>
      </Popover.Trigger>
      <Popover.Content className={styles.productPopover} align="start" sideOffset={4} aria-label="Products">
        <label><Search size={16} aria-hidden="true"/><input type="search" placeholder="Search products..." aria-label="Search products"
          value={query} maxLength={100} onChange={event => { clear(); setQuery(event.target.value); }}
          onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }}/></label>
        {message && <p role="status">{message}</p>}
        <ul>{options.map(item => <li key={item.id}><button type="button" disabled={ids.includes(item.id)} onClick={() => {
          setSelected(current => [...current.filter(product => product.id !== item.id), item]);
          update(multiple ? [...ids, item.id].join(', ') : item.id);
          setOpen(false);
          clear();
          setQuery('');
        }}><ProductReference item={item}/></button></li>)}</ul>
      </Popover.Content>
    </Popover.Root>
    {ids.length > 0 && <ul className={styles.selectedProducts}>{ids.map(id => <li key={id}>
      <ProductReference item={label(id)}>
        <button type="button" className="icon-button" aria-label={'Remove ' + label(id).name}
          onClick={() => update(ids.filter(value => value !== id).join(', '))}><X size={15}/></button>
      </ProductReference>
    </li>)}</ul>}
  </div>;
}
export function ContentProductPicker({ multiple, value, update, production = false, products = [] }: {
  multiple: boolean; value: string; update: (value: string) => void; production?: boolean; products?: ContentProduct[];
}) {
  return production ? <ProductionProductPicker multiple={multiple} value={value} update={update} products={products}/>
    : <GenericProductPicker multiple={multiple} value={value} update={update}/>;
}

function GenericProductPicker({ multiple, value, update }: {
  multiple: boolean; value: string; update: (value: string) => void;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<ContentProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [labels, setLabels] = useState<Record<string,string>>({});
  const ids = value.split(/[\s,]+/).filter(Boolean);
  async function search() {
    if (busy || q.trim().length < 2) return;
    setBusy(true); setFeedback('');
    try {
      const response = await fetch(adminPath('/api/content-products?q=' + encodeURIComponent(q.trim())));
      if (!response.ok) throw new Error();
      const rows = await response.json() as ContentProduct[];
      setItems(rows);
      if (!rows.length) setFeedback('No products match.');
    } catch { setFeedback('Could not search products. Try again.'); }
    finally { setBusy(false); }
  }
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    void search();
  }
  return <div className="cms-product-picker">
    <label>Find products<input type="search" value={q} onChange={event => setQ(event.target.value)} onKeyDown={onKey} maxLength={100}/></label>
    <button type="button" className="button secondary" disabled={q.trim().length < 2 || busy} onClick={() => void search()}>Search products</button>
    {feedback && <p role="status">{feedback}</p>}
    {!!items.length && <ul>{items.map(item => <li key={item.id}>
      <button type="button" className="button subtle" disabled={ids.includes(item.id)} onClick={() => {
        update(multiple ? [...new Set([...ids, item.id])].join(', ') : item.id);
        setLabels({ ...labels, [item.id]: item.name });
      }}>{item.name}</button>
    </li>)}</ul>}
    {ids.some(id => labels[id]) && <p>Selected: {ids.map(id => labels[id] || id).join(', ')}</p>}
  </div>;
}
