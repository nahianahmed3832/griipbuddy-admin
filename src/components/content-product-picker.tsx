'use client';

import { useState, type KeyboardEvent } from 'react';
import { adminPath } from '@/lib/paths';

type Option = { id: string; name: string };
export function ContentProductPicker({ multiple, value, update }: {
  multiple: boolean; value: string; update: (value: string) => void;
}) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Option[]>([]);
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
      const rows = await response.json() as Option[];
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
